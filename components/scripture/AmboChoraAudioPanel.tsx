// AmboChoraAudioPanel — the Chora tab of Ambo's library.
//
// Catalogue (public Chora, personal locker, Audius), local files, and audio
// playlists — local ones and personal playlists from the Chora service. Every
// song can go to three places, and they are deliberately separate:
//   · Play / Queue      → the independent audio bus (AmboAudioBus) — plays on
//                         top of, or alongside, whatever is on the screens
//   · DJ Play / Cue / Take → the DJ deck (waveform, EQ, hot cues)
//   · + Slide           → an AUDIO layer on a slide, which lives and dies with it
//
// Songs carry cue notes (colour + label + note) that tint the whole row, and a
// playlist can be grouped or permanently organized by cue.

import { SquareFrame, squareGridStyle } from './AmboSquareThumb';
import { AmboPoster } from './AmboPoster';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Search, Plus, Music, ChevronLeft, Sparkles, Volume2, Play, ListPlus, ListMusic,
  Shuffle, StickyNote, LayoutGrid, List as ListIcon, FolderOpen, ArrowUp, ArrowDown,
  Trash2, MoreHorizontal, Check, CornerDownRight, Cloud, HardDrive, Layers, Disc3,
} from 'lucide-react';
import type { Album } from '../../types';
import type { AmboDJTrack } from './AmboDJTrackPlayer';
import type { AmboAudioPlaylist } from './AmboNewAudioPlaylistModal';
import AmboCueEditor, { CueRowStyle } from './AmboCueEditor';
import { useAudioBus, useCuesVersion } from './AmboAudioBus';
import { bus, registerLocalFiles, isTrackPlayable, type BusTrack } from '../../services/ambo/audioBus';
import {
  getCue, setCue, cueHex, groupIdsByCue, sortIdsByCue, LIBRARY_SCOPE,
} from '../../services/ambo/audioCues';

const line = 'rgba(255,255,255,0.09)';
const LOCAL_KEY = 'ambo_local_audio_v1';
const VIEW_KEY = 'ambo_chora_view_v1';

const CATALOG_CATS = [
  { id: 'all', label: 'All Chora Music' },
  { id: 'Artists & Albums', label: 'Artists & Albums' },
  { id: 'Personal Music Locker', label: 'Personal Locker' },
  { id: 'Local Files', label: 'Local Files' },
  { id: 'Audio Playlists', label: 'Audio Playlists' },
  { id: 'Worship Anthems', label: 'Worship Anthems' },
  { id: 'Anthems & Hymns', label: 'Anthems & Hymns' },
  { id: 'Ambient Pads (12 Keys)', label: 'Ambient Pads (12 Keys)' },
  { id: 'Multitrack Stems', label: 'Multitrack Stems' },
];

const toBus = (t: AmboDJTrack, cueScope?: string): BusTrack => ({
  id: t.id || `t_${t.title}`,
  title: t.title,
  artist: t.artist,
  url: t.url,
  coverImage: t.coverImage,
  duration: t.duration,
  key: t.key,
  bpm: t.bpm,
  category: t.category,
  source: (t as any).source ?? (t.category === 'Audius' ? 'audius' : 'chora'),
  cueScope,
  timeCodedLyrics: t.timeCodedLyrics,
});

const durSec = (d?: number | string) => {
  if (typeof d === 'number') return d;
  if (typeof d === 'string' && d.includes(':')) { const [m, s] = d.split(':').map(Number); return (m || 0) * 60 + (s || 0); }
  return 0;
};
const fmtTotal = (sec: number) => {
  if (!sec) return '';
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
};

interface Props {
  choraPublicTracks: AmboDJTrack[];
  personalLockerTracks: AmboDJTrack[];
  audiusTrending: AmboDJTrack[];
  choraPublicAlbums: Album[];
  isLoadingChora: boolean;

  audioPlaylists: AmboAudioPlaylist[];
  onUpdatePlaylist: (id: string, patch: Partial<AmboAudioPlaylist>) => void;
  onDeletePlaylist: (id: string) => void;
  onOpenNewPlaylist: () => void;

  selectedSubcat: string;
  setSelectedSubcat: (s: string) => void;
  selectedPlaylistId: string | null;
  setSelectedPlaylistId: (id: string | null) => void;
  expandedAlbumId: string | null;
  setExpandedAlbumId: (id: string | null) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  debouncedSearch: string;

  onPlayAudioTrack?: (t: AmboDJTrack) => void;
  onCueAudioTrack?: (t: AmboDJTrack) => void;
  onTakeAudioTrack?: (t: AmboDJTrack) => void;
  onInsertAudioSlide?: (t: AmboDJTrack) => void;
  currentPlayingAudioId?: string | null;
}

export const AmboChoraAudioPanel: React.FC<Props> = (p) => {
  const busState = useAudioBus();
  useCuesVersion(); // re-render on any cue change
  const busCurrentId = busState.queue[busState.index]?.id;

  const [view, setView] = useState<'list' | 'gallery'>(() => {
    try { return (localStorage.getItem(VIEW_KEY) as any) || 'list'; } catch { return 'list'; }
  });
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, view); } catch { /* */ } }, [view]);

  const [groupByCue, setGroupByCue] = useState(false);
  const [cueFor, setCueFor] = useState<{ el: HTMLElement; t: AmboDJTrack; scope: string } | null>(null);
  const [menuFor, setMenuFor] = useState<{ el: HTMLElement; t: AmboDJTrack } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Local files: metadata survives reloads; the audio itself must be re-picked
  // (browsers don't keep file access), which re-links by name+size.
  const [localTracks, setLocalTracks] = useState<AmboDJTrack[]>(() => {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch { return []; }
  });
  const addLocalFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const tracks = registerLocalFiles(files).map(t => ({ ...t, source: 'local' as const })) as AmboDJTrack[];
    setLocalTracks(prev => {
      const have = new Set(prev.map(t => t.id));
      const next = [...prev, ...tracks.filter(t => !have.has(t.id))];
      try { localStorage.setItem(LOCAL_KEY, JSON.stringify(next)); } catch { /* */ }
      return next;
    });
    p.setSelectedSubcat('Local Files');
    p.setSelectedPlaylistId(null);
  };
  const forgetLocal = (id?: string) => setLocalTracks(prev => {
    const next = prev.filter(t => t.id !== id);
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(next)); } catch { /* */ }
    return next;
  });

  const catalog = useMemo(() => {
    const m = new Map<string, AmboDJTrack>();
    for (const t of [...p.choraPublicTracks, ...p.personalLockerTracks, ...p.audiusTrending, ...localTracks]) {
      if (t.id && !m.has(t.id)) m.set(t.id, t);
    }
    return m;
  }, [p.choraPublicTracks, p.personalLockerTracks, p.audiusTrending, localTracks]);

  const activePlaylist = p.selectedSubcat === 'Audio Playlists' && p.selectedPlaylistId
    ? p.audioPlaylists.find(x => x.id === p.selectedPlaylistId) ?? null
    : null;

  /** A playlist's songs, in its order, resolved from the catalogue or its snapshots. */
  const resolve = (pl: AmboAudioPlaylist): AmboDJTrack[] => {
    const snaps = new Map((pl.tracks || []).map(t => [t.id, t as AmboDJTrack]));
    const out: AmboDJTrack[] = [];
    for (const id of pl.trackIds) {
      const t = catalog.get(id) ?? snaps.get(id);
      if (t) out.push(t);
    }
    return out;
  };

  const addToPlaylist = (pl: AmboAudioPlaylist, t: AmboDJTrack) => {
    if (!t.id || pl.trackIds.includes(t.id)) return;
    const snap = { id: t.id, title: t.title, artist: t.artist, url: t.url, duration: t.duration, coverImage: t.coverImage, key: t.key, bpm: t.bpm, category: t.category, source: (t as any).source };
    p.onUpdatePlaylist(pl.id, {
      trackIds: [...pl.trackIds, t.id],
      tracks: [...(pl.tracks || []).filter(x => x.id !== t.id), snap],
    });
  };

  const playPlaylist = (pl: AmboAudioPlaylist, opts: { shuffle?: boolean; startId?: string } = {}) => {
    const tracks = resolve(pl).map(t => toBus(t, pl.id));
    if (!tracks.length) return;
    const start = opts.startId ? Math.max(0, tracks.findIndex(t => t.id === opts.startId)) : 0;
    bus.playQueue(tracks, start, { shuffle: opts.shuffle ?? false });
  };

  // ── which songs to show ──
  const shown: AmboDJTrack[] = useMemo(() => {
    if (activePlaylist) return resolve(activePlaylist);
    let base: AmboDJTrack[];
    if (p.expandedAlbumId) {
      const album = p.choraPublicAlbums.find(a => a.id === p.expandedAlbumId);
      const ids = new Set((album?.tracks || []).map(tr => tr.id));
      base = [...p.choraPublicTracks].filter(t => ids.has(t.id || ''));
    } else if (p.selectedSubcat === 'Local Files') {
      base = localTracks;
    } else {
      base = [...p.choraPublicTracks, ...p.personalLockerTracks, ...p.audiusTrending];
      if (p.selectedSubcat !== 'all' && p.selectedSubcat !== 'All Chora Music') base = base.filter(t => t.category === p.selectedSubcat);
    }
    const q = p.debouncedSearch.trim().toLowerCase();
    if (q) {
      base = base.filter(t => {
        const cue = getCue(LIBRARY_SCOPE, t.id);
        return t.title?.toLowerCase().includes(q) || t.artist?.toLowerCase().includes(q) || t.key?.toLowerCase().includes(q)
          || String(t.bpm || '').includes(q) || cue?.label?.toLowerCase().includes(q) || cue?.note?.toLowerCase().includes(q);
      });
    }
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlaylist, p.expandedAlbumId, p.selectedSubcat, p.debouncedSearch, p.choraPublicTracks, p.personalLockerTracks, p.audiusTrending, p.choraPublicAlbums, localTracks, catalog]);

  const scope = activePlaylist?.id ?? LIBRARY_SCOPE;
  const showPlaylistGallery = p.selectedSubcat === 'Audio Playlists' && !p.selectedPlaylistId;

  // ── row actions ──
  const rowButtons = (t: AmboDJTrack) => (
    <>
      <button
        onClick={() => activePlaylist ? playPlaylist(activePlaylist, { startId: t.id }) : bus.playQueue([toBus(t)], 0)}
        className="px-2 py-1 rounded text-[10px] font-bold text-[#0b0812] bg-[#D0BCFF] hover:bg-white transition-all flex items-center gap-1"
        title={activePlaylist ? 'Play the playlist from this song (audio bus)' : 'Play now on the audio bus — runs independently of slides'}
      ><Play size={10} fill="currentColor" /> Play</button>
      <button
        onClick={() => p.onPlayAudioTrack?.(t)}
        className="px-2 py-1 rounded text-[10px] font-bold text-white bg-[#FF8C00]/80 hover:bg-[#FF8C00] transition-all flex items-center gap-1"
        title="Play in the DJ deck — the expanded player with waveform, EQ, loops and hot cues"
      ><Disc3 size={10} /> DJ</button>
      <button
        onClick={() => bus.enqueue([toBus(t, activePlaylist?.id)])}
        className="p-1 rounded text-white/70 hover:text-white bg-white/5 hover:bg-white/15 border border-white/10"
        title="Add to the audio queue"
      ><ListPlus size={12} /></button>
      <button
        onClick={e => setCueFor({ el: e.currentTarget, t, scope })}
        className="p-1 rounded bg-white/5 hover:bg-white/15 border border-white/10"
        style={{ color: cueHex(getCue(scope, t.id)?.color) ?? 'rgba(255,255,255,0.7)' }}
        title="Cue note"
      ><StickyNote size={12} /></button>
      <button
        onClick={e => setMenuFor({ el: e.currentTarget, t })}
        className="p-1 rounded text-white/70 hover:text-white bg-white/5 hover:bg-white/15 border border-white/10"
        title="More — DJ deck, slide, playlists"
      ><MoreHorizontal size={12} /></button>
    </>
  );

  const renderRow = (t: AmboDJTrack, i: number, total: number) => {
    const cue = getCue(scope, t.id);
    const hex = cueHex(cue?.color);
    const onBus = busCurrentId === t.id;
    const onDeck = p.currentPlayingAudioId === t.id;
    const playable = isTrackPlayable(toBus(t));
    return (
      <div
        key={`${t.id}_${i}`}
        draggable
        onDragStart={e => {
          e.dataTransfer.setData('application/json', JSON.stringify({ type: 'ambo-audio', track: t }));
          e.dataTransfer.setData('text/plain', t.title);
        }}
        className={`flex items-center justify-between gap-2 pl-3 pr-2 py-2 rounded-xl border transition-all group cursor-grab active:cursor-grabbing ${
          onBus || onDeck ? 'border-[#FF8C00]/60' : 'border-white/10 hover:border-white/20'
        }`}
        style={{ background: onBus || onDeck ? 'rgba(255,140,0,0.08)' : 'rgba(255,255,255,0.02)', ...CueRowStyle(hex) }}
        onDoubleClick={() => activePlaylist ? playPlaylist(activePlaylist, { startId: t.id }) : bus.playQueue([toBus(t)], 0)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg overflow-hidden bg-[#D0BCFF]/10 text-[#D0BCFF] grid place-items-center flex-none">
            {t.coverImage ? <img src={t.coverImage} alt="" className="w-full h-full object-cover" loading="lazy" /> : (t as any).source === 'local' ? <HardDrive size={14} /> : <Music size={15} />}
          </div>
          <div className="min-w-0">
            <div className={`text-[12px] font-semibold truncate flex items-center gap-2 ${playable ? 'text-white' : 'text-white/40'}`}>
              <span className="truncate">{t.title}</span>
              {cue?.label && (
                <span className="px-1.5 rounded font-bold text-[8.5px] uppercase tracking-wide flex-none" style={{ background: `${hex}33`, color: hex ?? undefined }}>{cue.label}</span>
              )}
              {onBus && <span className="text-[8.5px] font-bold text-[#FF8C00] flex-none">{busState.playing ? '● ON AIR · AUDIO' : 'LOADED'}</span>}
            </div>
            {cue?.note ? (
              <div className="text-[10.5px] text-white/80 truncate flex items-center gap-1"><CornerDownRight size={10} style={{ color: hex ?? undefined }} className="flex-none" />{cue.note}</div>
            ) : (
              <div className="text-[10px] text-white/40 flex items-center gap-2 truncate">
                <span>{t.artist || 'Chora'}</span>
                {t.key && <><span>·</span><span className="text-[#00DAF3]">{t.key}</span></>}
                {!!t.bpm && <span>· {t.bpm} BPM</span>}
                {!playable && <span className="text-[#F5C542]">· not linked — Add files again</span>}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-none">
          {t.duration ? <span className="font-mono text-[10px] text-white/40 mr-1">{typeof t.duration === 'number' ? `${Math.floor(t.duration / 60)}:${String(Math.round(t.duration % 60)).padStart(2, '0')}` : t.duration}</span> : null}
          {activePlaylist && (
            <>
              <button onClick={() => movePl(activePlaylist, i, i - 1)} disabled={i === 0 || groupByCue} className="p-1 rounded text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-20" title="Move up"><ArrowUp size={11} /></button>
              <button onClick={() => movePl(activePlaylist, i, i + 1)} disabled={i === total - 1 || groupByCue} className="p-1 rounded text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-20" title="Move down"><ArrowDown size={11} /></button>
            </>
          )}
          {rowButtons(t)}
        </div>
      </div>
    );
  };

  const movePl = (pl: AmboAudioPlaylist, from: number, to: number) => {
    const ids = resolve(pl).map(t => t.id!).filter(Boolean);
    if (to < 0 || to >= ids.length) return;
    const [x] = ids.splice(from, 1);
    ids.splice(to, 0, x);
    p.onUpdatePlaylist(pl.id, { trackIds: ids });
  };

  const renderTile = (t: AmboDJTrack, i: number) => {
    const cue = getCue(scope, t.id);
    const hex = cueHex(cue?.color);
    const onBus = busCurrentId === t.id;
    return (
      <div
        key={`${t.id}_${i}`}
        draggable
        onDragStart={e => { e.dataTransfer.setData('application/json', JSON.stringify({ type: 'ambo-audio', track: t })); }}
        className="group relative flex flex-col gap-1 p-1.5 rounded-xl border transition-all"
        style={{ borderColor: hex ? `${hex}88` : onBus ? 'rgba(255,140,0,0.6)' : 'rgba(255,255,255,0.08)', background: hex ? `${hex}14` : 'rgba(255,255,255,0.02)' }}
        title={cue?.note || t.title}
      >
        <SquareFrame className="rounded-lg bg-white/5">
          <AmboPoster label={t.title} cover={t.coverImage} kind="audio" gradient="linear-gradient(135deg,#2a1f45,#120d1f)" />
          {hex && <div className="absolute inset-x-0 top-0 h-1" style={{ background: hex }} />}
          <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
            <button onClick={() => activePlaylist ? playPlaylist(activePlaylist, { startId: t.id }) : bus.playQueue([toBus(t)], 0)} className="p-2 rounded-full bg-white text-[#0b0812]" title="Play"><Play size={13} fill="currentColor" /></button>
            <button onClick={() => bus.enqueue([toBus(t, activePlaylist?.id)])} className="p-2 rounded-full bg-white/20 text-white" title="Queue"><ListPlus size={13} /></button>
            <button onClick={e => setMenuFor({ el: e.currentTarget, t })} className="p-2 rounded-full bg-white/20 text-white" title="More"><MoreHorizontal size={13} /></button>
          </div>
          {onBus && busState.playing && <div className="absolute bottom-1 left-1 px-1 rounded text-[8px] font-bold bg-[#FF8C00] text-black">ON AIR</div>}
        </SquareFrame>
        <div className="min-w-0 px-0.5">
          <div className="text-[10.5px] font-semibold text-white truncate">{t.title}</div>
          <div className="text-[9px] truncate" style={{ color: hex ?? 'rgba(255,255,255,0.45)' }}>
            {cue?.label ? <b>{cue.label}</b> : (t.artist || 'Chora')}
          </div>
        </div>
        <button
          onClick={e => setCueFor({ el: e.currentTarget, t, scope })}
          className="absolute top-2.5 right-2.5 p-1 rounded-md bg-black/60 opacity-0 group-hover:opacity-100"
          style={{ color: hex ?? '#fff' }}
          title="Cue note"
        ><StickyNote size={11} /></button>
      </div>
    );
  };

  const mosaic = (pl: AmboAudioPlaylist) => {
    const covers = resolve(pl).map(t => t.coverImage).filter(Boolean).slice(0, 4) as string[];
    if (covers.length >= 4) return <div className="grid grid-cols-2 w-full h-full">{covers.map((c, i) => <img key={i} src={c} alt="" className="w-full h-full object-cover" loading="lazy" />)}</div>;
    if (covers.length) return <img src={covers[0]} alt="" className="w-full h-full object-cover" loading="lazy" />;
    // No art: a strip of the playlist's cue colours, so playlists still read apart.
    const hexes = pl.trackIds.map(id => cueHex(getCue(pl.id, id)?.color)).filter(Boolean).slice(0, 6) as string[];
    return (
      <div className="w-full h-full grid place-items-center" style={{ background: hexes.length ? `linear-gradient(135deg, ${hexes.join(', ')})` : 'linear-gradient(135deg, #2a1f45, #120d1f)' }}>
        <ListMusic size={22} className="text-white/50" />
      </div>
    );
  };

  const songsList = shown;
  const groups = activePlaylist && groupByCue ? groupIdsByCue(activePlaylist.id, songsList.map(t => t.id!).filter(Boolean)) : null;
  const totalSec = songsList.reduce((a, t) => a + durSec(t.duration), 0);

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      {/* ── Left: catalogue + playlists ── */}
      <div className="w-56 border-r p-2 flex flex-col gap-1 flex-none overflow-y-auto" style={{ borderColor: line, background: 'rgba(0,0,0,0.2)' }}>
        <div className="text-[9.5px] font-extrabold uppercase tracking-wider text-white/40 mb-1">Chora Catalog</div>
        {CATALOG_CATS.map(cat => (
          <button
            key={cat.id}
            onClick={() => { p.setSelectedSubcat(cat.id); p.setSelectedPlaylistId(null); p.setExpandedAlbumId(null); }}
            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all flex items-center justify-between ${
              p.selectedSubcat === cat.id && !p.selectedPlaylistId ? 'bg-white/15 text-white font-bold' : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>{cat.label}</span>
            {cat.id === 'Local Files' && localTracks.length > 0 && <span className="text-[9px] font-mono opacity-50">{localTracks.length}</span>}
          </button>
        ))}

        <div className="mt-3 pt-2 border-t border-white/10 flex flex-col gap-1">
          <div className="flex items-center justify-between px-1 mb-1">
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-white/40">Playlists</span>
            <button onClick={p.onOpenNewPlaylist} className="p-1 rounded bg-[#D0BCFF]/15 hover:bg-[#D0BCFF]/25 text-[#D0BCFF]" title="Create new audio playlist"><Plus size={11} /></button>
          </div>
          {p.audioPlaylists.map(pl => (
            <div key={pl.id} className="group flex items-center gap-1">
              <button
                onClick={() => { p.setSelectedSubcat('Audio Playlists'); p.setSelectedPlaylistId(pl.id); p.setExpandedAlbumId(null); }}
                className={`flex-1 min-w-0 text-left px-2 py-1 rounded-md text-[10.5px] transition-all flex items-center justify-between ${
                  p.selectedPlaylistId === pl.id ? 'bg-[#D0BCFF]/20 text-[#D0BCFF] font-bold border border-[#D0BCFF]/30' : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <span className="truncate flex items-center gap-1">{pl.source === 'chora' ? <Cloud size={9} className="flex-none opacity-60" /> : null}{pl.title}</span>
                <span className="text-[9px] font-mono opacity-50 flex-none ml-1">{pl.trackIds?.length || 0}</span>
              </button>
              <button onClick={() => playPlaylist(pl)} className="p-1 rounded text-white/40 hover:text-white hover:bg-white/10 opacity-0 group-hover:opacity-100" title="Play playlist"><Play size={10} /></button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="px-3 py-2 border-b border-white/10 bg-black/30 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              placeholder="Search title, artist, key, BPM or cue..."
              value={p.searchQuery}
              onChange={e => p.setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1 rounded-lg bg-white/5 border border-white/10 focus:border-[#D0BCFF] text-white text-[11px] outline-none placeholder:text-white/30"
            />
          </div>
          <div className="flex items-center gap-1.5 flex-none">
            <div className="flex rounded-lg border border-white/10 overflow-hidden" role="group" aria-label="View">
              <button onClick={() => setView('list')} className={`p-1.5 ${view === 'list' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'}`} title="List"><ListIcon size={12} /></button>
              <button onClick={() => setView('gallery')} className={`p-1.5 ${view === 'gallery' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'}`} title="Gallery"><LayoutGrid size={12} /></button>
            </div>
            <button onClick={() => fileRef.current?.click()} className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-white/80 border border-white/10 text-[10px] font-bold flex items-center gap-1" title="Play audio files from this computer">
              <FolderOpen size={11} /> Local files
            </button>
            <input ref={fileRef} type="file" accept="audio/*" multiple hidden onChange={e => { addLocalFiles(e.target.files); e.target.value = ''; }} />
            <button onClick={p.onOpenNewPlaylist} className="px-2.5 py-1 rounded-lg bg-[#D0BCFF]/15 hover:bg-[#D0BCFF]/25 text-[#D0BCFF] border border-[#D0BCFF]/30 text-[10px] font-bold flex items-center gap-1">
              <Plus size={11} /> New Playlist
            </button>
          </div>
        </div>

        <div className="flex-1 p-3 overflow-y-auto space-y-2">
          {/* ── Playlist gallery ── */}
          {showPlaylistGallery && (
            p.audioPlaylists.length === 0 ? (
              <div className="h-40 grid place-items-center text-[11px] text-white/40">No playlists yet — create one with New Playlist.</div>
            ) : (
              <div style={squareGridStyle(150, 12)}>
                {p.audioPlaylists.map(pl => {
                  const tracks = resolve(pl);
                  return (
                    <div key={pl.id} className="group flex flex-col gap-1.5 p-2 rounded-xl border border-white/10 hover:border-white/25 bg-white/[0.02] transition-all">
                      <button onClick={() => p.setSelectedPlaylistId(pl.id)} className="block w-full text-left">
                        <SquareFrame className="rounded-lg bg-white/5">
                          {mosaic(pl)}
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </SquareFrame>
                      </button>
                      <div className="min-w-0">
                        <div className="text-[11.5px] font-bold text-white truncate flex items-center gap-1">{pl.source === 'chora' && <Cloud size={10} className="text-white/40 flex-none" />}{pl.title}</div>
                        <div className="text-[9.5px] text-white/45 truncate">{tracks.length} songs{pl.category ? ` · ${pl.category}` : ''}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => playPlaylist(pl)} disabled={!tracks.length} className="flex-1 px-2 py-1 rounded-md text-[10px] font-bold text-[#0b0812] bg-[#D0BCFF] hover:bg-white disabled:opacity-30 flex items-center justify-center gap-1"><Play size={10} fill="currentColor" /> Play</button>
                        <button onClick={() => playPlaylist(pl, { shuffle: true })} disabled={!tracks.length} className="p-1 rounded-md text-white/70 bg-white/5 hover:bg-white/15 border border-white/10 disabled:opacity-30" title="Shuffle"><Shuffle size={11} /></button>
                        <button onClick={() => bus.enqueue(tracks.map(t => toBus(t, pl.id)))} disabled={!tracks.length} className="p-1 rounded-md text-white/70 bg-white/5 hover:bg-white/15 border border-white/10 disabled:opacity-30" title="Add all to queue"><ListPlus size={11} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* ── Playlist header ── */}
          {activePlaylist && (
            <div className="flex items-center gap-3 p-2 rounded-xl border border-white/10 bg-white/[0.02]">
              <button onClick={() => p.setSelectedPlaylistId(null)} className="p-1 rounded text-white/50 hover:text-white hover:bg-white/10" title="All playlists"><ChevronLeft size={14} /></button>
              <div className="w-14 h-14 rounded-lg overflow-hidden flex-none">{mosaic(activePlaylist)}</div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold text-white truncate flex items-center gap-1.5">
                  {activePlaylist.title}
                  {activePlaylist.source === 'chora' && <span className="px-1.5 rounded text-[8.5px] font-bold text-white/60 bg-white/10 flex items-center gap-0.5"><Cloud size={8} /> CHORA</span>}
                </div>
                <div className="text-[10px] text-white/45">{songsList.length} songs{totalSec ? ` · ${fmtTotal(totalSec)}` : ''}{activePlaylist.description ? ` · ${activePlaylist.description}` : ''}</div>
              </div>
              <div className="flex items-center gap-1 flex-none">
                <button onClick={() => playPlaylist(activePlaylist)} disabled={!songsList.length} className="px-3 py-1.5 rounded-lg text-[10.5px] font-bold text-[#0b0812] bg-[#D0BCFF] hover:bg-white disabled:opacity-30 flex items-center gap-1"><Play size={11} fill="currentColor" /> Play</button>
                <button onClick={() => playPlaylist(activePlaylist, { shuffle: true })} disabled={!songsList.length} className="p-1.5 rounded-lg text-white/70 bg-white/5 hover:bg-white/15 border border-white/10 disabled:opacity-30" title="Shuffle play"><Shuffle size={12} /></button>
                <button onClick={() => bus.enqueue(songsList.map(t => toBus(t, activePlaylist.id)))} disabled={!songsList.length} className="p-1.5 rounded-lg text-white/70 bg-white/5 hover:bg-white/15 border border-white/10 disabled:opacity-30" title="Add all to queue"><ListPlus size={12} /></button>
                <span className="w-px h-5 bg-white/10 mx-1" />
                <button
                  onClick={() => setGroupByCue(g => !g)}
                  className={`px-2 py-1.5 rounded-lg text-[10px] font-bold border flex items-center gap-1 ${groupByCue ? 'text-[#D0BCFF] bg-[#D0BCFF]/15 border-[#D0BCFF]/30' : 'text-white/70 bg-white/5 border-white/10 hover:bg-white/15'}`}
                  title="Show the playlist in sections by cue"
                ><Layers size={11} /> Group by cue</button>
                <button
                  onClick={() => p.onUpdatePlaylist(activePlaylist.id, { trackIds: sortIdsByCue(activePlaylist.id, songsList.map(t => t.id!).filter(Boolean)) })}
                  disabled={songsList.length < 2}
                  className="px-2 py-1.5 rounded-lg text-[10px] font-bold text-white/70 bg-white/5 border border-white/10 hover:bg-white/15 disabled:opacity-30 flex items-center gap-1"
                  title="Reorder the playlist by cue colour, then label — this is the play order"
                ><StickyNote size={11} /> Organize by cue</button>
                {activePlaylist.source !== 'chora' && (
                  <button
                    onClick={() => { if (window.confirm(`Delete playlist "${activePlaylist.title}"?`)) { p.onDeletePlaylist(activePlaylist.id); p.setSelectedPlaylistId(null); } }}
                    className="p-1.5 rounded-lg text-white/40 hover:text-[#FF5A5F] bg-white/5 hover:bg-white/10 border border-white/10"
                    title="Delete playlist"
                  ><Trash2 size={12} /></button>
                )}
              </div>
            </div>
          )}

          {/* ── Album grid ── */}
          {!activePlaylist && !showPlaylistGallery && (p.selectedSubcat === 'all' || p.selectedSubcat === 'Artists & Albums') && p.choraPublicAlbums.length > 0 && !p.expandedAlbumId && !p.debouncedSearch.trim() && (
            <div className="p-1">
              <div className="text-[9px] font-extrabold uppercase tracking-wider text-white/40 mb-2 px-1">Albums & Artists</div>
              <div style={squareGridStyle(112, 8)}>
                {p.choraPublicAlbums.map(album => (
                  <button key={album.id} onClick={() => p.setExpandedAlbumId(album.id)} className="flex flex-col items-center gap-1 p-1 rounded-lg hover:bg-white/5 transition-all">
                    <SquareFrame className="rounded-md bg-white/5">
                      <AmboPoster label={album.title} cover={album.coverImage} kind="audio" gradient="linear-gradient(135deg,#2a1f45,#120d1f)" />
                    </SquareFrame>
                    <span className="text-[9px] text-white/70 truncate w-full text-center leading-tight">{album.title}</span>
                    <span className="text-[8px] text-white/40 truncate w-full text-center">{album.artist}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {p.expandedAlbumId && (() => {
            const album = p.choraPublicAlbums.find(a => a.id === p.expandedAlbumId);
            if (!album) return null;
            return (
              <div className="flex items-center gap-3 p-2">
                <button onClick={() => p.setExpandedAlbumId(null)} className="p-1 rounded text-white/50 hover:text-white hover:bg-white/10" title="Back to albums"><ChevronLeft size={14} /></button>
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-white/5 flex-none">{album.coverImage && <img src={album.coverImage} alt="" className="w-full h-full object-cover" />}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-white truncate">{album.title}</div>
                  <div className="text-[10px] text-white/50">{album.artist} · {songsList.length} tracks</div>
                </div>
                <button onClick={() => bus.playQueue(songsList.map(t => toBus(t)), 0)} disabled={!songsList.length} className="px-3 py-1.5 rounded-lg text-[10.5px] font-bold text-[#0b0812] bg-[#D0BCFF] hover:bg-white disabled:opacity-30 flex items-center gap-1"><Play size={11} fill="currentColor" /> Play album</button>
              </div>
            );
          })()}

          {p.selectedSubcat === 'Local Files' && !activePlaylist && (
            <div
              className="p-3 rounded-xl border border-dashed border-white/15 text-center text-[10.5px] text-white/45"
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); addLocalFiles(e.dataTransfer.files); }}
            >
              Drop audio files here or use <button onClick={() => fileRef.current?.click()} className="text-[#D0BCFF] font-bold hover:underline">Local files</button>. Files play straight from this computer — nothing is uploaded.
              {localTracks.some(t => !isTrackPlayable(toBus(t))) && <div className="mt-1 text-[#F5C542]">Dimmed songs were added in an earlier session — add the same files again to re-link them.</div>}
            </div>
          )}

          {/* ── Songs ── */}
          {!showPlaylistGallery && (
            p.isLoadingChora && !songsList.length ? (
              <div className="p-3" style={squareGridStyle(112, 8)}>
                {Array.from({ length: 12 }).map((_, i) => <div key={i} className="aspect-square rounded-lg bg-white/5 animate-pulse" />)}
              </div>
            ) : songsList.length === 0 ? (
              <div className="h-40 flex flex-col items-center justify-center text-white/40 text-xs">
                <Music size={24} className="mb-2 opacity-40" />
                <span>{activePlaylist ? 'This playlist is empty.' : 'No audio tracks found here.'}</span>
                <span className="text-[10px] opacity-60 mt-1">{activePlaylist ? 'Use ⋯ → Add to playlist on any song.' : 'Try searching, add local files, or upload to your Personal Music Locker.'}</span>
              </div>
            ) : groups ? (
              groups.map(g => (
                <div key={g.key} className="space-y-1.5">
                  <div className="flex items-center gap-2 pt-2 px-1">
                    <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: g.hex ?? 'rgba(255,255,255,0.25)' }} />
                    <span className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: g.hex ?? 'rgba(255,255,255,0.45)' }}>{g.title}</span>
                    <span className="text-[9px] font-mono text-white/35">{g.ids.length}</span>
                    <div className="flex-1 h-px" style={{ background: g.hex ? `${g.hex}40` : 'rgba(255,255,255,0.08)' }} />
                    <button
                      onClick={() => activePlaylist && bus.enqueue(g.ids.map(id => songsList.find(t => t.id === id)).filter(Boolean).map(t => toBus(t!, activePlaylist.id)))}
                      className="px-1.5 py-0.5 rounded text-[9px] font-bold text-white/60 hover:text-white bg-white/5 hover:bg-white/15 border border-white/10 flex items-center gap-1"
                      title="Queue this section"
                    ><ListPlus size={10} /> Queue section</button>
                  </div>
                  {view === 'gallery' ? (
                    <div style={squareGridStyle(132, 8)}>
                      {g.ids.map((id, i) => { const t = songsList.find(x => x.id === id); return t ? renderTile(t, i) : null; })}
                    </div>
                  ) : g.ids.map((id) => { const i = songsList.findIndex(x => x.id === id); return i >= 0 ? renderRow(songsList[i], i, songsList.length) : null; })}
                </div>
              ))
            ) : view === 'gallery' ? (
              <div style={squareGridStyle(132, 8)}>{songsList.map(renderTile)}</div>
            ) : (
              songsList.map((t, i) => renderRow(t, i, songsList.length))
            )
          )}
        </div>
      </div>

      {cueFor && (
        <AmboCueEditor
          anchor={cueFor.el}
          trackTitle={cueFor.t.title}
          value={getCue(cueFor.scope, cueFor.t.id)}
          onSave={cue => cueFor.t.id && setCue(cueFor.scope, cueFor.t.id, cue)}
          onClose={() => setCueFor(null)}
        />
      )}

      {menuFor && (
        <RowMenu anchor={menuFor.el} onClose={() => setMenuFor(null)}>
          {close => (
            <>
              <MenuItem onClick={() => { bus.playNext(toBus(menuFor.t, activePlaylist?.id)); close(); }} icon={<CornerDownRight size={11} />}>Play next</MenuItem>
              <MenuItem onClick={() => { p.onPlayAudioTrack?.(menuFor.t); close(); }} icon={<Sparkles size={11} />}>Open in DJ deck</MenuItem>
              <MenuItem onClick={() => { p.onCueAudioTrack?.(menuFor.t); close(); }} icon={<Volume2 size={11} />}>DJ — cue in Preview</MenuItem>
              <MenuItem onClick={() => { p.onTakeAudioTrack?.(menuFor.t); close(); }} icon={<Play size={11} />} tone="#FF8C00">DJ — take to Program</MenuItem>
              <MenuItem onClick={() => { p.onInsertAudioSlide?.(menuFor.t); close(); }} icon={<Plus size={11} />}>Insert as audio slide</MenuItem>
              <div className="my-1 h-px bg-white/10" />
              <div className="px-2.5 pt-0.5 pb-1 text-[8.5px] font-extrabold uppercase tracking-wider text-white/35">Add to playlist</div>
              {p.audioPlaylists.length === 0 && <div className="px-2.5 py-1 text-[10px] text-white/40">No playlists yet</div>}
              {p.audioPlaylists.map(pl => {
                const inIt = !!menuFor.t.id && pl.trackIds.includes(menuFor.t.id);
                const localIntoChora = pl.source === 'chora' && (menuFor.t as any).source === 'local';
                return (
                  <MenuItem
                    key={pl.id}
                    disabled={inIt || localIntoChora}
                    title={localIntoChora ? 'Local files can only go in Ambo playlists — Chora playlists sync to the cloud' : undefined}
                    onClick={() => { addToPlaylist(pl, menuFor.t); close(); }}
                    icon={inIt ? <Check size={11} /> : pl.source === 'chora' ? <Cloud size={11} /> : <ListMusic size={11} />}
                  >{pl.title}</MenuItem>
                );
              })}
              <MenuItem onClick={() => { close(); p.onOpenNewPlaylist(); }} icon={<Plus size={11} />}>New playlist…</MenuItem>
              {activePlaylist && menuFor.t.id && (
                <>
                  <div className="my-1 h-px bg-white/10" />
                  <MenuItem
                    tone="#FF5A5F"
                    icon={<Trash2 size={11} />}
                    onClick={() => { p.onUpdatePlaylist(activePlaylist.id, { trackIds: activePlaylist.trackIds.filter(id => id !== menuFor.t.id) }); close(); }}
                  >Remove from “{activePlaylist.title}”</MenuItem>
                </>
              )}
              {(menuFor.t as any).source === 'local' && !activePlaylist && (
                <MenuItem tone="#FF5A5F" icon={<Trash2 size={11} />} onClick={() => { forgetLocal(menuFor.t.id); close(); }}>Remove from Local Files</MenuItem>
              )}
            </>
          )}
        </RowMenu>
      )}
    </div>
  );
};

// ── tiny anchored menu ───────────────────────────────────────────────────────

const RowMenu: React.FC<{ anchor: HTMLElement; onClose: () => void; children: (close: () => void) => React.ReactNode }> = ({ anchor, onClose, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: -9999, left: -9999 });
  useEffect(() => {
    const r = anchor.getBoundingClientRect();
    const h = ref.current?.offsetHeight ?? 320;
    const w = 220;
    const left = Math.min(window.innerWidth - w - 8, Math.max(8, r.right - w));
    const top = r.bottom + 4 + h > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4;
    setPos({ top, left });
    const down = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', down); window.removeEventListener('keydown', key); };
  }, [anchor, onClose]);
  return createPortal(
    <div ref={ref} role="menu" className="fixed z-[10000] w-[220px] max-h-[70vh] overflow-y-auto rounded-xl border p-1 shadow-2xl"
      style={{ top: pos.top, left: pos.left, background: 'rgba(16,12,26,0.97)', borderColor: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(12px)' }}>
      {children(onClose)}
    </div>,
    document.body,
  );
};

const MenuItem: React.FC<{ onClick: () => void; icon?: React.ReactNode; tone?: string; disabled?: boolean; title?: string; children: React.ReactNode }> = ({ onClick, icon, tone, disabled, title, children }) => (
  <button
    role="menuitem"
    disabled={disabled}
    title={title}
    onClick={onClick}
    className="w-full text-left px-2.5 py-1.5 rounded-lg text-[10.5px] flex items-center gap-2 hover:bg-white/10 disabled:opacity-35 disabled:hover:bg-transparent transition-colors"
    style={{ color: tone ?? 'rgba(255,255,255,0.85)' }}
  >
    <span className="w-3.5 flex-none grid place-items-center">{icon}</span>
    <span className="truncate">{children}</span>
  </button>
);

export default AmboChoraAudioPanel;
