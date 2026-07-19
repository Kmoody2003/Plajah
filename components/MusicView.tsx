import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import HistoryMomentPulseCard from './HistoryMomentPulseCard';
import { Album, Track, UserProfile, Playlist } from '../types';
import PageHeader from './PageHeader';
const AlbumArt3DViewer = lazy(() => import('./AlbumArt3DViewer'));
import {
  Play, Pause, SkipForward, SkipBack, Heart, Share2,
  Radio, Music2, Mic2, Disc, Star, TrendingUp,
  ChevronLeft, ChevronRight, PlayCircle, User,
  ListMusic, Sparkles, Clock, Zap, BookOpen, Headphones, VideoIcon, LayoutGrid,
  Filter, ArrowUpDown, Archive, History, Library, Search,
  Headphones as HeadphonesIcon, BarChart2, Flame, Plus, X, Trash2, ChevronDown, ChevronUp, Layers, Upload, Waves, Film
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { fetchAllPublicAlbums, fetchUpcomingAlbums, fetchUserProfile, searchUsers, fetchSystemSettingsConfig, fetchPlaylistsByIds, syncPublicDomainAsset, fetchPersonalPlaylists, fetchPersonalTracks, createPlaylist, deletePlaylist, addTrackToPlaylist, addExternalTrackToPlaylist, removeTrackFromPlaylist, fetchTrackStats, updateUserProfile, auth } from '../services/backendService';
import SignInPrompt from './SignInPrompt';
import PlaylistPickerModal from './PlaylistPickerModal';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';
import MyLibraryView from './MyLibraryView';
import FeaturedCarousel from './FeaturedCarousel';
import ThreeDImage from './ThreeDImage';
import { thumb, onThumbError, THUMB } from '../src/lib/imageThumb';
import { AdaptiveGrid, TYPE } from '../src/lib/designSystem';
import { PodcastsView } from './PodcastsView';
import {
  fetchArchiveMusic, fetchWikimediaAudio, fetchJamendoMusic, fetchArchiveAudiobooks, fetchArchivePodcasts,
  ArchiveTrack, AudioKind, VaultSort, VaultShelf,
  VAULT_TAXONOMY, VAULT_SHELVES, vaultKind, fetchVaultTracks, sortVaultTracks,
} from '../services/archiveContentService';
import {
  fetchAudiusTrending, searchAudius,
  loadAudiusCuration, fetchAudiusPlaylistTracks, fetchAudiusArtistTracks, fetchAudiusArtistById,
  audiusAlbumToNativeAlbum,
  AudiusCuration, AudiusPlaylist, AudiusArtist, AudiusAlbum,
} from '../services/audiusService';
import { listIncomingLicenseRequests } from '../services/licenseRequests';
import PlajahPlusBanner from './PlajahPlusBanner';
import { WC26_TEAMS } from '../data/worldCup2026';
import { ANTHEM_LYRICS } from '../data/anthemLyrics';
import { WC_ANTHEM_ALBUM } from '../data/wcAnthemAlbum';
import { shareAsset } from '../services/deepLinkService';

// Share a single Chora track — the link lands on the track's album page and (via the
// AutoPlayCountdown) offers a 5s auto-play. `albumId` is the track's parent album.
const shareTrack = (albumId: string, track: { id: string; title?: string; artist?: string }) => {
  shareAsset('track', albumId, {
    title: track.title,
    text: `🎵 ${track.title || 'This track'} — ${track.artist || 'Plajah'} on Plajah`,
    extra: { track: track.id },
  });
};
// Short, human labels for the Vault's archive sources.
const SOURCE_LABEL: Record<string, string> = {
  INTERNET_ARCHIVE: 'Internet Archive',
  LIBRARY_OF_CONGRESS: 'Library of Congress',
  WIKIMEDIA: 'Wikimedia',
  JAMENDO: 'Jamendo',
  AUDIUS: 'Audius',
  SOUND_CLOUD: 'SoundCloud',
};
const SOURCE_SHORT: Record<string, string> = {
  INTERNET_ARCHIVE: 'ARCHIVE',
  LIBRARY_OF_CONGRESS: 'LOC',
  WIKIMEDIA: 'WIKI',
  JAMENDO: 'JAMENDO',
  AUDIUS: 'AUDIUS',
  SOUND_CLOUD: 'SC',
};

// The PRIMARY Vault axis, given a face. Order matches VAULT_TAXONOMY.
// Concrete ComponentType, not React.ElementType — the latter collapses JSX props to `never`.
type KindIcon = React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
const KIND_META: Record<string, { icon: KindIcon; accent: string }> = {
  MUSIC:           { icon: Music2,     accent: '#ff8c00' },
  HISTORIC:        { icon: History,    accent: '#fbbf24' },
  SPEECH:          { icon: Mic2,       accent: '#60a5fa' },
  AUDIOBOOK:       { icon: BookOpen,   accent: '#a78bfa' },
  PODCAST:         { icon: Radio,      accent: '#f472b6' },
  FIELD_RECORDING: { icon: Waves,      accent: '#34d399' },
  INTERVIEW:       { icon: Headphones, accent: '#f87171' },
};

const VAULT_SORTS: { id: VaultSort; label: string }[] = [
  { id: 'TRENDING', label: 'Popular' },
  { id: 'RECENT',   label: 'Newest' },
  { id: 'OLDEST',   label: 'Earliest' },
  { id: 'AZ',       label: 'A–Z' },
];

const AudiusArtistPage = lazy(() => import('./AudiusArtistPage'));
const AudiusAlbumView  = lazy(() => import('./AudiusAlbumView'));
const ChoraConservatory = lazy(() => import('./ChoraConservatory'));

// ── World Cup Anthem Banner ────────────────────────────────────────────────────
const WcAnthemBanner: React.FC<{ onOpenPlaylist: () => void }> = ({ onOpenPlaylist }) => {
  const [dismissed, setDismissed] = React.useState(() => localStorage.getItem('wc26_anthem_banner_dismissed') === '1');
  if (dismissed) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 relative overflow-hidden rounded-2xl px-4 py-2.5 sm:px-5 sm:py-4 flex items-center gap-3 sm:gap-4 cursor-pointer group"
      style={{ background: 'linear-gradient(135deg, #001A35 0%, #003366 50%, #001A35 100%)', border: '1px solid rgba(255,140,0,0.3)' }}
      onClick={onOpenPlaylist}
    >
      {/* Flags strip */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-10 select-none">
        <div className="flex gap-1 text-2xl pt-2 pl-2">
          {WC26_TEAMS.slice(0, 16).map(t => <span key={t.id}>{t.flag}</span>)}
        </div>
      </div>
      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-[#FF8C00]/15 flex items-center justify-center shrink-0 text-base sm:text-xl">🎵</div>
      <div className="flex-1 min-w-0">
        {/* Phone: a single tight line */}
        <p className="sm:hidden text-xs font-black text-white truncate">Nations of the World Cup Anthems</p>
        {/* Tablet+: the richer copy */}
        <p className="hidden sm:block text-[7px] font-black uppercase tracking-[0.4em] text-[#FF8C00] mb-0.5">World Cup 2026</p>
        <p className="hidden sm:block text-xs font-black text-white leading-snug">
          Celebrate the Countries of the World Cup — in music with our World Cup Playlist of National Anthems
        </p>
      </div>
      <button
        onClick={onOpenPlaylist}
        className="shrink-0 px-3 py-1.5 sm:px-4 sm:py-2 bg-[#FF8C00] text-black rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-[#FFA020] transition-colors whitespace-nowrap"
      >
        Play All
      </button>
      <button
        onClick={e => { e.stopPropagation(); localStorage.setItem('wc26_anthem_banner_dismissed', '1'); setDismissed(true); }}
        className="shrink-0 p-1.5 rounded-full text-white/30 hover:text-white/60 transition-colors"
      >
        <X size={12} />
      </button>
    </motion.div>
  );
};

// ── World Cup Anthems Playlist ─────────────────────────────────────────────────
const WcAnthemPlaylist: React.FC<{ onOpenAlbum?: (album: Album) => void }> = ({ onOpenAlbum }) => {
  const { playTrack } = useGlobalPlayerState();
  const [open, setOpen] = React.useState(false);
  const [playingId, setPlayingId] = React.useState<string | null>(null);
  const [showLyricsId, setShowLyricsId] = React.useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const anthemTracks = React.useMemo(() =>
    WC26_TEAMS.map(team => ({
      id: `wc26_anthem_${team.id}`,
      teamId: team.id,
      title: team.anthem,
      artist: team.name,
      flag: team.flag,
      url: `/audio/anthems/${team.id}.mp3`,
      albumCover: '',
      primaryColor: team.primaryColor,
      lyrics: ANTHEM_LYRICS[team.id] ?? null,
    })), []);

  const playAnthem = (track: typeof anthemTracks[0]) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    if (playingId === track.id) { setPlayingId(null); return; }
    const el = new Audio(track.url);
    el.play().catch(() => {});
    el.onended = () => setPlayingId(null);
    audioRef.current = el;
    setPlayingId(track.id);
    playTrack({
      id: track.id, title: track.title, artist: track.artist,
      url: track.url, albumCover: track.albumCover,
    } as any, null as any, 'LIBRARY');
  };

  return (
    <div className="rounded-3xl overflow-hidden border border-[#FF8C00]/20" style={{ background: 'linear-gradient(135deg, #001A35 0%, #000D1A 100%)' }}>
      {/* Header */}
      <div className="flex items-center gap-4 p-6 cursor-pointer" onClick={() => setOpen(v => !v)}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shrink-0" style={{ background: 'rgba(255,140,0,0.12)', border: '1px solid rgba(255,140,0,0.25)' }}>🌍</div>
        <div className="flex-1 min-w-0">
          <p className="text-[7px] font-black uppercase tracking-[0.5em] text-[#FF8C00] mb-0.5">Plajah Official · World Cup 2026</p>
          <h3 className="text-lg font-black text-white leading-snug">National Anthems of the World Cup</h3>
          <p className="text-[9px] text-white/40 mt-0.5">48 nations · Official recordings · Lyrics included</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={e => { e.stopPropagation(); playAnthem(anthemTracks[0]); }}
            className="w-10 h-10 rounded-2xl flex items-center justify-center bg-[#FF8C00] hover:bg-[#FFA020] transition-colors"
          >
            <Play size={16} className="text-black ml-0.5" fill="currentColor" />
          </button>
          {onOpenAlbum && (
            <button
              onClick={e => { e.stopPropagation(); onOpenAlbum(WC_ANTHEM_ALBUM); }}
              className="px-3 py-2 rounded-xl border border-[#FF8C00]/30 text-[#FF8C00] text-[8px] font-black uppercase tracking-widest hover:bg-[#FF8C00]/10 transition-colors whitespace-nowrap"
            >
              Open
            </button>
          )}
          {open ? <ChevronUp size={16} className="text-white/30" /> : <ChevronDown size={16} className="text-white/30" />}
        </div>
      </div>

      {/* Track list */}
      {open && (
        <div className="border-t border-white/8">
          {anthemTracks.map((track, idx) => (
            <div key={track.id} className="border-b border-white/[0.04] last:border-0">
              <div
                className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.03] transition-colors group cursor-pointer"
                onClick={() => playAnthem(track)}
              >
                <span className="text-[9px] font-bold text-white/20 w-5 text-center shrink-0">{idx + 1}</span>
                <span className="text-xl leading-none shrink-0">{track.flag}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black text-white truncate group-hover:text-[#FF8C00] transition-colors">{track.title}</p>
                  <p className="text-[8px] text-white/30 uppercase tracking-widest truncate">{track.artist}</p>
                </div>
                {track.lyrics && (
                  <button
                    onClick={e => { e.stopPropagation(); setShowLyricsId(showLyricsId === track.id ? null : track.id); }}
                    className="shrink-0 px-2 py-1 rounded-lg text-[7px] font-black uppercase tracking-widest text-white/30 hover:text-white/60 border border-white/10 hover:border-white/25 transition-all"
                  >
                    Lyrics
                  </button>
                )}
                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0">
                  {playingId === track.id
                    ? <Pause size={12} className="text-[#FF8C00]" fill="currentColor" />
                    : <Play size={12} className="text-white/30 group-hover:text-white/60 transition-colors ml-0.5" fill="currentColor" />
                  }
                </div>
              </div>
              {showLyricsId === track.id && track.lyrics && (
                <div
                  className="mx-5 mb-3 max-h-56 overflow-y-auto rounded-xl p-4 text-[8px] leading-relaxed text-white/45 whitespace-pre-wrap font-mono"
                  style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)' }}
                >
                  {track.lyrics}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

type TabType = 'NEW' | 'FOR_YOU' | 'ARTISTS' | 'ALBUMS' | 'GENRES' | 'VAULT' | 'PODCASTS' | 'AUDIO_BOOKS' | 'MY_LIBRARY' | 'PLAYLISTS';

interface MusicViewProps {
  onBack: () => void;
  onSelectAlbum: (album: Album) => void;
  onVisitUser: (uid: string, initialTab?: string) => void;
  userProfile: UserProfile | null;
  initialTab?: TabType;
  onUploadMusic?: () => void;
  onNavigate?: (view: string) => void;
}

const MusicView: React.FC<MusicViewProps> = ({ onBack, onSelectAlbum, onVisitUser, userProfile, initialTab, onUploadMusic, onNavigate }) => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<UserProfile[]>([]);
  const [curatedPlaylists, setCuratedPlaylists] = useState<Playlist[]>([]);
  const [vaultTracks, setVaultTracks] = useState<ArchiveTrack[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>(initialTab ?? 'NEW');
  const [isLoading, setIsLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState<'RECENT' | 'ALPHA'>('RECENT');
  // 3-way source filter for the Artists/Albums browse:
  //   ALL   = platform + Audius + your personal locker
  //   CHORA = platform + Audius only (the Chora catalog)
  //   OWNED = only your personal-library / owned content
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'CHORA' | 'OWNED'>(() => {
    const saved = localStorage.getItem('chora_sourceFilter');
    return saved === 'CHORA' || saved === 'OWNED' ? saved : 'ALL';
  });
  const [personalTracks, setPersonalTracks] = useState<Track[]>([]);
  const [pendingSyncReqs, setPendingSyncReqs] = useState(0);
  const [vaultSource, setVaultSource] = useState<'ALL' | 'INTERNET_ARCHIVE' | 'LIBRARY_OF_CONGRESS' | 'WIKIMEDIA' | 'JAMENDO' | 'AUDIUS'>('ALL');
  // ── Vault: two orthogonal axes + an independent sort ────────────────────
  //   PRIMARY   what kind of audio this is        (null = the featured view)
  //   SECONDARY genre/subcategory, scoped to kind (null = all of that kind)
  //   SORT      a ranking, never a category
  const [vaultKindSel, setVaultKindSel] = useState<AudioKind | null>(null);
  const [vaultSub, setVaultSub] = useState<string | null>(null);
  const [vaultSort, setVaultSort] = useState<VaultSort>('TRENDING');
  const [vaultLoading, setVaultLoading] = useState(false);
  const [vaultShelves, setVaultShelves] = useState<Array<VaultShelf & { items: ArchiveTrack[] }>>([]);
  const [shelvesLoading, setShelvesLoading] = useState(false);
  const [vaultDetail, setVaultDetail] = useState<ArchiveTrack | null>(null);
  const shelvesStarted = useRef(false);
  const [album3D, setAlbum3D] = useState<Album | null>(null);
  const [vaultSearchQuery, setVaultSearchQuery] = useState('');
  const [audiusSearchResults, setAudiusSearchResults] = useState<ArchiveTrack[]>([]);
  const [audiusEnabled, setAudiusEnabled] = useState(() => {
    // Fast localStorage seed; profile value wins once loaded
    const saved = localStorage.getItem('chora_audiusEnabled');
    return saved !== null ? JSON.parse(saved) : (userProfile?.uiSettings?.audiusEnabled ?? false);
  });
  const [audiusCuration, setAudiusCuration] = useState<AudiusCuration | null>(null);
  const [audiusLoading, setAudiusLoading] = useState(false);
  const [selectedArchiveArtist, setSelectedArchiveArtist] = useState<string | null>(null);
  const [selectedAudiusArtist, setSelectedAudiusArtist] = useState<AudiusArtist | null>(null);
  const [selectedAudiusAlbum, setSelectedAudiusAlbum]   = useState<AudiusAlbum | null>(null);
  const [showConservatory, setShowConservatory] = useState(false);
  const { playTrack, isPlaying, currentTrack, theme } = useGlobalPlayerState();

  const [personalPlaylists, setPersonalPlaylists] = useState<Playlist[]>([]);
  const [playlistPickerTrack, setPlaylistPickerTrack] = useState<Track | null>(null);
  const [openPlaylistId, setOpenPlaylistId] = useState<string | null>(null);
  const [trackStats, setTrackStats] = useState<Record<string, number>>({});
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [signInAction, setSignInAction] = useState<string | null>(null);

  const [bgIndex, setBgIndex] = useState(0);
  const [pulseIdx, setPulseIdx] = useState(0);
  const [sponsoredIdx, setSponsoredIdx] = useState(0);
  const [upcomingAlbums, setUpcomingAlbums] = useState<Album[]>([]);

  const bgAlbums = useMemo(() =>
    [...albums]
      .filter(a => !!a.coverImage)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 5),
    [albums]
  );

  // Badge the "Sync Requests" button with the count of filmmakers awaiting a reply.
  useEffect(() => {
    const uid = userProfile?.uid;
    if (!uid) { setPendingSyncReqs(0); return; }
    listIncomingLicenseRequests(uid)
      .then(rs => setPendingSyncReqs(rs.filter(r => r.status === 'PENDING').length))
      .catch(() => {});
  }, [userProfile?.uid]);

  useEffect(() => {
    if (bgAlbums.length < 2) return;
    const id = setInterval(() => {
      setBgIndex(prev => {
        let next = Math.floor(Math.random() * bgAlbums.length);
        if (next === prev) next = (prev + 1) % bgAlbums.length;
        return next;
      });
    }, 6000);
    return () => clearInterval(id);
  }, [bgAlbums.length]);

  useEffect(() => {
    if (upcomingAlbums.length < 2) return;
    const id = setInterval(() => setPulseIdx(i => (i + 1) % upcomingAlbums.length), 5000);
    return () => clearInterval(id);
  }, [upcomingAlbums.length]);

  useEffect(() => {
    if (upcomingAlbums.length < 2) return;
    const id = setInterval(() => setSponsoredIdx(i => (i + 1) % upcomingAlbums.length), 7000);
    return () => clearInterval(id);
  }, [upcomingAlbums.length]);

  // Featured shelves — the editorial rail. Loaded once, independent of the
  // kind/subgenre selection so switching filters never costs a refetch.
  //
  // Each shelf resolves on its own rather than behind a single Promise.all:
  // archive.org's advancedsearch regularly takes ~20s while loc.gov answers in
  // ~2s, and waiting on the slowest would hide the whole rail behind it.
  // Shelves are re-sorted into their declared order as they land.
  useEffect(() => {
    if (activeTab !== 'VAULT' || shelvesStarted.current) return;
    shelvesStarted.current = true;
    let cancelled = false;
    const order = new Map(VAULT_SHELVES.map((s, i) => [s.id, i]));
    let pending = VAULT_SHELVES.length;
    setShelvesLoading(true);

    VAULT_SHELVES.forEach(shelf => {
      shelf.fetch(12)
        .then(items => {
          if (cancelled || !items.length) return;
          setVaultShelves(prev =>
            [...prev.filter(s => s.id !== shelf.id), { ...shelf, items }]
              .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
          );
        })
        .catch(err => console.error(`[Vault] shelf "${shelf.id}" failed:`, err))
        .finally(() => { if (!cancelled && --pending === 0) setShelvesLoading(false); });
    });

    return () => { cancelled = true; };
  }, [activeTab]);

  // Browse grid — resolves the two-axis selection through the taxonomy.
  useEffect(() => {
    if (activeTab !== 'VAULT') return;
    let cancelled = false;

    const settle = async (jobs: Array<Promise<ArchiveTrack[]>>) => {
      const rs = await Promise.allSettled(jobs);
      return rs.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
    };

    const loadVault = async () => {
      setVaultLoading(true);
      setVaultTracks([]);
      try {
        if (!vaultKindSel) {
          // No kind picked → a broad cross-section. loc.gov answers in ~2s while
          // archive.org's search can take ~20s, so show the fast spine first and
          // fold the slower sources in behind it rather than blocking on them.
          const fast = await settle([
            fetchVaultTracks('HISTORIC', 'jukebox', 16),
            fetchVaultTracks('SPEECH', null, 8),
          ]);
          if (cancelled) return;
          setVaultTracks(fast);
          setVaultLoading(false);

          const slow = await settle([
            fetchVaultTracks('MUSIC', null, 16),
            fetchAudiusTrending(undefined, 16) as Promise<ArchiveTrack[]>,
          ]);
          if (!cancelled && slow.length) setVaultTracks(prev => [...prev, ...slow]);
          return;
        }

        let tracks = await fetchVaultTracks(vaultKindSel, vaultSub, 40);
        // Audius is a living catalogue, so it only makes sense under MUSIC.
        if (vaultKindSel === 'MUSIC') {
          const sub = vaultKind('MUSIC')?.subgenres.find(s => s.id === vaultSub);
          const audius = await fetchAudiusTrending(sub?.label, 16).catch(() => [] as ArchiveTrack[]);
          tracks = [...tracks, ...audius];
        }
        if (!cancelled) setVaultTracks(tracks);
      } catch (err) {
        console.error('[Vault] load error:', err);
        if (!cancelled) setVaultTracks([]);
      } finally {
        if (!cancelled) setVaultLoading(false);
      }
    };

    loadVault();
    return () => { cancelled = true; };
  }, [activeTab, vaultKindSel, vaultSub]);

  // Audius live search when source = AUDIUS
  useEffect(() => {
    if (!vaultSearchQuery || vaultSource !== 'AUDIUS') { setAudiusSearchResults([]); return; }
    const id = setTimeout(async () => {
      const results = await searchAudius(vaultSearchQuery, 30);
      setAudiusSearchResults(results);
    }, 400);
    return () => clearTimeout(id);
  }, [vaultSearchQuery, vaultSource]);

  // Sync profile's audiusEnabled into state once profile loads (wins over localStorage seed)
  useEffect(() => {
    if (userProfile?.uiSettings?.audiusEnabled !== undefined) {
      setAudiusEnabled(userProfile.uiSettings.audiusEnabled);
    }
  }, [userProfile?.uid]);

  // Load full Audius curation when Audius mode enabled
  useEffect(() => {
    if (!audiusEnabled || audiusCuration) return;
    setAudiusLoading(true);
    loadAudiusCuration(['Electronic', 'Hip-Hop/Rap', 'Pop', 'R&B/Soul', 'Rock', 'Jazz'])
      .then(setAudiusCuration)
      .finally(() => setAudiusLoading(false));
  }, [audiusEnabled]);

  const toggleAudiusEnabled = async () => {
    const next = !audiusEnabled;
    setAudiusEnabled(next);
    localStorage.setItem('chora_audiusEnabled', JSON.stringify(next));
    if (auth.currentUser) {
      try {
        await updateUserProfile(auth.currentUser.uid, {
          uiSettings: { ...userProfile?.uiSettings, audiusEnabled: next },
        });
      } catch (err) {
        console.error('[Chora] Failed to persist audiusEnabled:', err);
      }
    }
  };

  const getThemeStyles = () => {
    switch (theme) {
      case 'LIGHT':
        return { nav: 'bg-white/80 border-black/5 text-black', tabActive: 'text-small-orange border-small-orange', tabInactive: 'text-black/30 hover:text-black/60', heading: 'text-black', subtext: 'text-black/40' };
      case 'PASTEL':
        return { nav: 'bg-[#eee8d5]/80 border-black/5 text-[#073642]', tabActive: 'text-[#2aa198] border-[#2aa198]', tabInactive: 'text-[#073642]/30 hover:text-[#073642]/60', heading: 'text-[#073642]', subtext: 'text-[#073642]/40' };
      case 'PLAJAH':
        return { nav: 'bg-[#1a0026]/80 border-white/5 text-white', tabActive: 'text-small-orange border-small-orange', tabInactive: 'text-white/20 hover:text-white/40', heading: 'text-white', subtext: 'text-white/40' };
      case 'ETHEREAL':
        return { nav: 'bg-[#131314]/80 border-purple-500/20 text-white', tabActive: 'text-[#d0bcff] border-[#d0bcff]', tabInactive: 'text-white/20 hover:text-white/40', heading: 'text-white', subtext: 'text-white/40' };
      case 'CITRUS':
        return { nav: 'bg-black/90 border-[#FF3B00]/20 text-white', tabActive: 'text-[#FF3B00] border-[#FF3B00]', tabInactive: 'text-white/40 hover:text-[#FF3B00]', heading: 'text-white', subtext: 'text-white/40' };
      default:
        return { nav: 'bg-[#050505]/80 border-white/5 text-white', tabActive: 'text-small-orange border-small-orange', tabInactive: 'text-white/20 hover:text-white/40', heading: 'text-white', subtext: 'text-white/40' };
    }
  };

  const s = getThemeStyles();
  const carouselRef = useRef<HTMLDivElement>(null);

  // Listen for artist navigation events from AudiusArtistPage related-artists section
  useEffect(() => {
    const handler = (e: Event) => {
      const artist = (e as CustomEvent).detail as AudiusArtist;
      if (artist?.id) { setSelectedAudiusArtist(artist); setSelectedAudiusAlbum(null); }
    };
    window.addEventListener('audius-artist', handler);
    return () => window.removeEventListener('audius-artist', handler);
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [publicAlbums, allUsers, settings, myPlaylists, upcoming] = await Promise.all([
          fetchAllPublicAlbums(),
          searchUsers(''),
          fetchSystemSettingsConfig(),
          fetchPersonalPlaylists(),
          fetchUpcomingAlbums(),
        ]);
        const musicAlbums = publicAlbums.filter(a => (a.type || 'MUSIC') === 'MUSIC');
        setAlbums(musicAlbums);
        setUpcomingAlbums(upcoming.filter(a => (a.type || 'MUSIC') === 'MUSIC'));
        setArtists(allUsers.filter(u => u.isArtist));
        setPersonalPlaylists(myPlaylists);

        // Fetch track stats for all visible tracks
        const trackIds = musicAlbums.flatMap(a => a.tracks?.map(t => t.id) || []).slice(0, 100);
        if (trackIds.length) fetchTrackStats(trackIds).then(setTrackStats);

        if (settings.curatedMusicPlaylists && settings.curatedMusicPlaylists.length > 0) {
          const playlists = await fetchPlaylistsByIds(settings.curatedMusicPlaylists);
          setCuratedPlaylists(playlists);
        }
      } catch (error) {
        console.error("Failed to load music data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  // Personal music-locker content (owner-only) — powers the "Owned" filter + the "All" superset.
  useEffect(() => {
    if (!userProfile?.uid) { setPersonalTracks([]); return; }
    fetchPersonalTracks().then(setPersonalTracks).catch(() => setPersonalTracks([]));
  }, [userProfile?.uid]);

  useEffect(() => { localStorage.setItem('chora_sourceFilter', sourceFilter); }, [sourceFilter]);

  // Group locker tracks into playable Album objects (by albumId/title; loose tracks → per-artist Singles).
  const ownedAlbums = useMemo<Album[]>(() => {
    const map = new Map<string, Album>();
    for (const t of personalTracks) {
      const key = t.albumId || (t.albumTitle ? `title:${t.albumTitle}` : `singles:${t.artist || 'Unknown'}`);
      if (!map.has(key)) {
        map.set(key, {
          id: t.albumId || key,
          ownerId: (t as any).ownerId || userProfile?.uid,
          title: t.albumTitle || (key.startsWith('singles:') ? 'Singles' : (t.title || 'Album')),
          artist: t.artist || 'Unknown Artist',
          coverImage: t.albumCover || '',
          tracks: [],
          isPrivate: true,
        } as Album);
      }
      const a = map.get(key)!;
      a.tracks.push(t);
      if (!a.coverImage && t.albumCover) a.coverImage = t.albumCover;
    }
    const albums = Array.from(map.values());
    for (const a of albums) a.tracks.sort((x, y) => (((x as any).trackNo || 999) - ((y as any).trackNo || 999)));
    return albums;
  }, [personalTracks, userProfile?.uid]);

  // Synthetic artist cards derived from locker tracks (no real profile → local routing only).
  const ownedArtists = useMemo<UserProfile[]>(() => {
    const map = new Map<string, { name: string; cover?: string; count: number }>();
    for (const t of personalTracks) {
      const name = t.artist || 'Unknown Artist';
      if (!map.has(name)) map.set(name, { name, cover: t.albumCover, count: 0 });
      const a = map.get(name)!;
      a.count++;
      if (!a.cover && t.albumCover) a.cover = t.albumCover;
    }
    return Array.from(map.values()).map((a) => ({
      uid: `personal:${a.name}`,
      displayName: a.name,
      photoURL: a.cover || '',
      followerCount: a.count,
      isArtist: true,
    } as unknown as UserProfile));
  }, [personalTracks]);

  const visibleAlbums = () => {
    if (sourceFilter === 'OWNED') return ownedAlbums;
    if (sourceFilter === 'ALL') return [...getSortedAlbums(), ...ownedAlbums];
    return getSortedAlbums(); // CHORA
  };
  const visibleArtists = () => {
    if (sourceFilter === 'OWNED') return ownedArtists;
    if (sourceFilter === 'ALL') return [...getSortedArtists(), ...ownedArtists];
    return getSortedArtists(); // CHORA
  };

  // Clicking a synthetic personal artist card opens their locker album (or plays their first track).
  const handleArtistCardClick = (artist: UserProfile) => {
    if (typeof artist.uid === 'string' && artist.uid.startsWith('personal:')) {
      const name = artist.displayName;
      const albs = ownedAlbums.filter(a => a.artist === name);
      if (albs.length) { onSelectAlbum(albs[0]); return; }
      const trk = personalTracks.find(t => (t.artist || 'Unknown Artist') === name);
      if (trk) playTrack(trk, null, 'LIBRARY');
      return;
    }
    onVisitUser(artist.uid, 'CONTENT');
  };

  const genres = ['Hip Hop', 'R&B', 'Electronic', 'Jazz', 'Rock', 'Pop', 'Lo-Fi', 'Ambient', 'Classical', 'Folk', 'World'];

  const getSortedAlbums = () => {
    let sorted = [...albums];
    if (sortOrder === 'ALPHA') {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    } else {
      sorted.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
    return sorted;
  };

  const fmtPlays = (n: number) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n/1_000).toFixed(1)}K` : n.toString();

  const timeUntil = (ms: number): string => {
    const diff = ms - Date.now();
    if (diff <= 0) return 'Out Now';
    const d = Math.floor(diff / 86_400_000);
    const h = Math.floor((diff % 86_400_000) / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    if (d > 30) return `${Math.ceil(d / 30)}mo`;
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const fmtDate = (ms: number) =>
    new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const trendingAlbums = useMemo(() =>
    [...albums].filter(a => (a.playCount || 0) > 0).sort((a, b) => (b.playCount || 0) - (a.playCount || 0)).slice(0, 10),
    [albums]
  );

  const getSortedArtists = () => {
    let sorted = [...artists];
    if (sortOrder === 'ALPHA') {
      sorted.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
    } else {
      sorted.sort((a, b) => ((b.createdAt || b.joinedAt || 0) as number) - ((a.createdAt || a.joinedAt || 0) as number));
    }
    return sorted;
  };

  const handlePlayVaultTrack = (track: ArchiveTrack) => {
    // Automagically clone it to platform
    syncPublicDomainAsset(track, track.url, 'AUDIO');

    const vaultTrack: Track = {
      id: track.id,
      title: track.title,
      artist: track.artist,
      url: track.url,
      albumCover: track.thumbnailUrl,
      images: [track.thumbnailUrl],
      genre: track.genre,
      isGlobalArchive: true
    };
    const vaultAlbum: Album = {
      id: `vault_${track.source}_${track.id}`,
      title: 'The Vault Archive',
      artist: track.artist,
      coverImage: track.thumbnailUrl,
      tracks: [vaultTrack],
      createdAt: Date.now(),
      themeColor: '#ff8c00',
      // Carry the archive's own words through to the player, not a generic stub.
      description: track.source === 'AUDIUS'
        ? `Streaming via Audius — the decentralized music network. Artist earns on every play.`
        : [track.description, track.context, track.collection && `Collection: ${track.collection}`]
            .filter(Boolean).join('\n\n')
          || `Public domain recording from ${SOURCE_LABEL[track.source] ?? track.source}.`
    };
    playTrack(vaultTrack, vaultAlbum, 'RADIO');
  };

  // Open the full album/playlist view instead of immediately playing
  const handleOpenAudiusPlaylist = (playlist: AudiusPlaylist) => {
    const album: AudiusAlbum = {
      id: playlist.id,
      title: playlist.title,
      artworkUrl: playlist.artworkUrl,
      trackCount: playlist.trackCount,
      isAlbum: false,
      curatorId: playlist.curatorId,
      curator: playlist.curator,
      description: playlist.description,
    };
    openAudiusAlbumNative(album);
  };

  // Open an Audius album in the NATIVE Chora album UI (PlayerView) — same experience
  // as a platform release: tracks, visualizer, comments, player, artist link.
  const openAudiusAlbumNative = async (album: AudiusAlbum) => {
    const [tracks, curator] = await Promise.all([
      fetchAudiusPlaylistTracks(album.id).catch(() => []),
      album.curatorId ? fetchAudiusArtistById(album.curatorId).catch(() => null) : Promise.resolve(null),
    ]);
    onSelectAlbum(audiusAlbumToNativeAlbum(album, tracks, curator));
  };

  // Keep the play-directly path for quick-play from search etc.
  const handlePlayAudiusPlaylist = async (playlist: AudiusPlaylist) => {
    handleOpenAudiusPlaylist(playlist);
  };

  // Open the full artist page instead of immediately playing
  const handleOpenAudiusArtist = (artist: AudiusArtist) => {
    setSelectedAudiusArtist(artist);
    setSelectedAudiusAlbum(null);
  };

  const handlePlayAudiusArtist = (artist: AudiusArtist) => handleOpenAudiusArtist(artist);

  // Quick-add external track to playlist — shows a mini picker if multiple playlists exist
  const [externalTrackPicker, setExternalTrackPicker] = useState<ArchiveTrack | null>(null);

  const handleAddExternalToPlaylist = async (track: ArchiveTrack, playlistId: string) => {
    await addExternalTrackToPlaylist(playlistId, track);
    setExternalTrackPicker(null);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-transparent">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-4 border-small-orange border-t-transparent rounded-full animate-spin" />
          <p className="text-[10px] font-black uppercase tracking-[0.5em] text-white/20">Accessing Archives...</p>
        </div>
      </div>
    );
  }

  const renderVault = () => {
    // When AUDIUS source + search query → use live Audius search results
    const baseVault = (vaultSource === 'AUDIUS' && vaultSearchQuery && audiusSearchResults.length)
      ? audiusSearchResults
      : vaultSource === 'ALL' ? vaultTracks : vaultTracks.filter(t => t.source === vaultSource);

    let filteredVault = baseVault;
    if (vaultSearchQuery && !(vaultSource === 'AUDIUS' && audiusSearchResults.length)) {
      const q = vaultSearchQuery.toLowerCase();
      filteredVault = filteredVault.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        (t.collection || '').toLowerCase().includes(q)
      );
    }
    filteredVault = sortVaultTracks(filteredVault, vaultSort);

    const activeKind = vaultKindSel ? vaultKind(vaultKindSel) : null;
    const activeAccent = vaultKindSel ? KIND_META[vaultKindSel]?.accent ?? '#ff8c00' : '#ff8c00';
    const showFeatured = !vaultKindSel && !vaultSearchQuery;

    const sourceBadge = (track: ArchiveTrack) => {
      const isAudius = track.source === 'AUDIUS';
      const isLoc = track.source === 'LIBRARY_OF_CONGRESS';
      return (
        <div
          className="absolute top-2 right-2 px-2 py-1 backdrop-blur-md rounded-lg text-[7px] font-black uppercase tracking-widest"
          style={isAudius
            ? { background: 'rgba(126,34,206,0.85)', color: '#e9d5ff' }
            : isLoc
              ? { background: 'rgba(30,58,138,0.85)', color: '#bfdbfe' }
              : { background: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.8)' }}
        >
          {SOURCE_SHORT[track.source] ?? track.source.split('_')[0]}
        </div>
      );
    };

    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="shrink-0">
            <PageHeader wrapperClassName="mb-12">Plajah Vault</PageHeader>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-2 px-1">
              Library of Congress · Internet Archive · Wikimedia · Audius
            </p>
          </div>

          <div className="flex-1 max-w-sm">
            <div className="flex items-center gap-4 px-6 py-3 bg-white/5 border border-white/10 rounded-2xl">
              <Search size={16} className="text-white/20" />
              <input
                type="text"
                placeholder={vaultSource === 'AUDIUS' ? 'Search Audius…' : 'Search titles, people, collections…'}
                value={vaultSearchQuery}
                onChange={e => setVaultSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none text-xs font-bold w-full placeholder:text-white/10"
              />
            </div>
          </div>

          {/* Sort is its own axis — never a category */}
          <div className="flex flex-col gap-1.5 shrink-0">
            <p className="text-[7px] font-black uppercase tracking-[0.4em] text-white/25 px-1">Sort</p>
            <div className="flex items-center gap-1 p-1 rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {VAULT_SORTS.map(s => (
                <button
                  key={s.id}
                  onClick={() => setVaultSort(s.id)}
                  className="px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all whitespace-nowrap"
                  style={vaultSort === s.id
                    ? { background: 'rgba(255,255,255,0.92)', color: '#000' }
                    : { color: 'rgba(255,255,255,0.4)' }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── PRIMARY axis: what kind of audio ─────────────────────────── */}
        <div className="space-y-3">
          <p className="text-[7px] font-black uppercase tracking-[0.4em] text-white/25 px-1">Type of audio</p>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            <button
              onClick={() => { setVaultKindSel(null); setVaultSub(null); }}
              className="flex items-center gap-2 px-4 py-2 rounded-2xl text-[9px] font-black uppercase tracking-widest border transition-all whitespace-nowrap shrink-0"
              style={!vaultKindSel
                ? { background: '#fff', borderColor: '#fff', color: '#000' }
                : { background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.45)' }}
            >
              <Sparkles size={11} /> Featured
            </button>
            {VAULT_TAXONOMY.map(k => {
              const meta = KIND_META[k.id];
              const Icon = meta?.icon ?? Disc;
              const on = vaultKindSel === k.id;
              return (
                <button
                  key={k.id}
                  onClick={() => { setVaultKindSel(k.id); setVaultSub(null); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-2xl text-[9px] font-black uppercase tracking-widest border transition-all whitespace-nowrap shrink-0"
                  style={on
                    ? { background: meta.accent, borderColor: meta.accent, color: '#000' }
                    : { background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.45)' }}
                >
                  <Icon size={11} /> {k.label}
                </button>
              );
            })}
          </div>

          {/* ── SECONDARY axis: genre/subcategory, scoped to the kind ───── */}
          {activeKind && activeKind.subgenres.length > 0 && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
              <p className="text-[7px] font-black uppercase tracking-[0.4em] text-white/25 px-1">
                {activeKind.label} · Subcategory
              </p>
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                <button
                  onClick={() => setVaultSub(null)}
                  className="px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border transition-all whitespace-nowrap shrink-0"
                  style={!vaultSub
                    ? { background: activeAccent, borderColor: activeAccent, color: '#000' }
                    : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}
                >
                  All {activeKind.label}
                </button>
                {activeKind.subgenres.map(sub => (
                  <button
                    key={sub.id}
                    onClick={() => setVaultSub(sub.id)}
                    className="px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border transition-all whitespace-nowrap shrink-0"
                    style={vaultSub === sub.id
                      ? { background: activeAccent, borderColor: activeAccent, color: '#000' }
                      : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}
                  >
                    {sub.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Source chips — an independent filter over whatever is loaded */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {(['ALL', 'LIBRARY_OF_CONGRESS', 'INTERNET_ARCHIVE', 'AUDIUS', 'WIKIMEDIA', 'JAMENDO'] as const).map(source => (
              <button
                key={source}
                onClick={() => setVaultSource(source)}
                className="px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border transition-all whitespace-nowrap shrink-0"
                style={vaultSource === source
                  ? source === 'AUDIUS'
                    ? { background: '#7e22ce', borderColor: '#7e22ce', color: '#e9d5ff' }
                    : { background: '#fff', borderColor: '#fff', color: '#000' }
                  : { background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}
              >
                {source === 'ALL' ? 'All sources' : SOURCE_LABEL[source] ?? source}
              </button>
            ))}
          </div>
        </div>

        {/* What the selected kind actually is */}
        {activeKind && (
          <div className="flex items-start gap-3 px-5 py-3 rounded-2xl"
            style={{ background: `${activeAccent}12`, border: `1px solid ${activeAccent}33` }}>
            <Library size={13} className="shrink-0 mt-0.5" style={{ color: activeAccent }} />
            <p className="text-[10px] text-white/55 leading-relaxed">{activeKind.tagline}</p>
          </div>
        )}

        {/* ── Featured / why this matters ──────────────────────────────── */}
        {showFeatured && (
          <div className="space-y-10">
            {shelvesLoading && (
              <div className="flex items-center gap-3 px-1">
                <div className="w-4 h-4 border-2 border-small-orange border-t-transparent rounded-full animate-spin" />
                <p className="text-[9px] font-black uppercase tracking-[0.4em] text-white/25">
                  {vaultShelves.length === 0
                    ? 'Opening the archives…'
                    : `Loading more shelves… ${vaultShelves.length}/${VAULT_SHELVES.length}`}
                </p>
              </div>
            )}
            {vaultShelves.map(shelf => (
              <section key={shelf.id} className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: shelf.accent }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[7px] font-black uppercase tracking-[0.5em] mb-1" style={{ color: shelf.accent }}>
                      Why this matters
                    </p>
                    <h3 className="text-base font-black text-white leading-snug">{shelf.title}</h3>
                    <p className="text-[10px] text-white/45 leading-relaxed mt-1 max-w-2xl">{shelf.blurb}</p>
                  </div>
                  <button
                    onClick={() => { setVaultKindSel(shelf.kind); setVaultSub(null); }}
                    className="shrink-0 px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest border transition-all hover:bg-white/10"
                    style={{ borderColor: `${shelf.accent}55`, color: shelf.accent }}
                  >
                    Browse
                  </button>
                </div>
                <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                  {shelf.items.map(track => (
                    <div key={`${shelf.id}-${track.id}`} className="w-40 sm:w-44 shrink-0 group">
                      <div
                        className="aspect-square rounded-2xl overflow-hidden relative cursor-pointer mb-2"
                        style={{ background: 'rgba(255,255,255,0.04)' }}
                        onClick={() => handlePlayVaultTrack(track)}
                      >
                        {track.thumbnailUrl
                          ? <img src={thumb(track.thumbnailUrl, THUMB.small) || undefined} onError={onThumbError(track.thumbnailUrl)} loading="lazy" decoding="async" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                          : <div className="w-full h-full flex items-center justify-center"><Disc size={26} style={{ color: `${shelf.accent}66` }} /></div>}
                        <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center text-black" style={{ background: shelf.accent }}>
                            <Play size={18} fill="currentColor" className="ml-0.5" />
                          </div>
                        </div>
                        {track.year && (
                          <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md text-[7px] font-black tracking-widest backdrop-blur-md"
                            style={{ background: 'rgba(0,0,0,0.65)', color: 'rgba(255,255,255,0.85)' }}>
                            {track.year}
                          </div>
                        )}
                      </div>
                      <p className="text-[10px] font-black text-white leading-snug line-clamp-2">{track.title}</p>
                      <p className="text-[8px] text-white/35 uppercase tracking-widest truncate mt-0.5">{track.artist}</p>
                      {track.description && (
                        <button
                          onClick={() => setVaultDetail(track)}
                          className="mt-1 text-left text-[8px] leading-relaxed text-white/30 hover:text-white/60 transition-colors line-clamp-2"
                        >
                          {track.description}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
            {vaultShelves.length > 0 && (
              <div className="flex items-center gap-3 px-1 pt-2">
                <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.07)' }} />
                <p className="text-[7px] font-black uppercase tracking-[0.5em] text-white/20">Browse everything</p>
                <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.07)' }} />
              </div>
            )}
          </div>
        )}

        {/* Track grid */}
        {vaultLoading && filteredVault.length === 0 && (
          <div className="flex items-center gap-3 px-1 py-8">
            <div className="w-4 h-4 border-2 border-small-orange border-t-transparent rounded-full animate-spin" />
            <p className="text-[9px] font-black uppercase tracking-[0.4em] text-white/25">Retrieving recordings…</p>
          </div>
        )}
        {!vaultLoading && filteredVault.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <Archive size={22} className="text-white/15" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/25">Nothing here</p>
            <p className="text-[9px] text-white/25 max-w-xs leading-relaxed">
              No recordings matched this combination. Try a different subcategory, or widen the source filter.
            </p>
          </div>
        )}

        <AdaptiveGrid phone={1} tablet={2} desktop={4} gap="1.5rem">
          {filteredVault.map(track => (
            <motion.div
              key={track.id}
              whileHover={{ y: -5 }}
              className="group bg-white/[0.03] border border-white/5 rounded-3xl p-4 transition-all hover:bg-white/[0.08] flex flex-col"
              style={track.source === 'AUDIUS' ? { borderColor: 'rgba(168,85,247,0.15)' } : undefined}
            >
              <div className="aspect-square rounded-2xl overflow-hidden mb-4 relative cursor-pointer shrink-0" style={{ background: 'rgba(255,255,255,0.04)' }} onClick={() => handlePlayVaultTrack(track)}>
                {track.thumbnailUrl
                  ? <img src={thumb(track.thumbnailUrl, THUMB.small) || undefined} onError={onThumbError(track.thumbnailUrl)} className="w-full h-full object-cover transition-transform group-hover:scale-110" loading="lazy" decoding="async" />
                  : <div className="w-full h-full flex items-center justify-center"><Disc size={30} className="text-white/15" /></div>}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-black"
                    style={{ background: track.source === 'AUDIUS' ? '#a855f7' : 'var(--color-small-orange,#ff8c00)' }}>
                    <Play size={24} fill="currentColor" className="ml-1" />
                  </div>
                </div>
                {sourceBadge(track)}
                {track.year && (
                  <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md text-[7px] font-black tracking-widest backdrop-blur-md"
                    style={{ background: 'rgba(0,0,0,0.65)', color: 'rgba(255,255,255,0.85)' }}>
                    {track.year}
                  </div>
                )}
                {track.conservatory && (
                  <div className="absolute top-2 left-2 px-2 py-1 rounded-lg text-[7px] font-black uppercase tracking-widest backdrop-blur-md flex items-center gap-1"
                    style={{ background: 'rgba(56,189,248,0.85)', color: '#00232f' }}>
                    <Star size={7} fill="currentColor" /> Study
                  </div>
                )}
              </div>

              <h4 className="text-xs font-black uppercase tracking-widest line-clamp-2 mb-1">{track.title}</h4>

              <div className="flex items-center justify-between gap-1">
                <button
                  onClick={() => setSelectedArchiveArtist(track.artist)}
                  className="text-[9px] font-bold uppercase tracking-widest hover:text-small-orange transition-colors truncate"
                  style={{ color: track.source === 'AUDIUS' ? 'rgba(168,85,247,0.8)' : 'rgba(255,255,255,0.4)' }}
                >
                  {track.artist}
                </button>
                {personalPlaylists.length > 0 && (
                  <button
                    onClick={e => { e.stopPropagation(); setExternalTrackPicker(track); }}
                    title="Add to playlist"
                    className="tap shrink-0 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: 'rgba(255,255,255,0.08)' }}
                  >
                    <Plus size={10} className="text-white/60" />
                  </button>
                )}
              </div>

              {/* Provenance — label, matrix/take, collection, format */}
              {track.context && (
                <p className="text-[8px] uppercase tracking-widest text-white/25 truncate mt-1.5">{track.context}</p>
              )}
              {/* The archive's own description of what this recording is */}
              {track.description && (
                <button
                  onClick={() => setVaultDetail(track)}
                  className="text-left text-[9px] leading-relaxed text-white/40 hover:text-white/70 transition-colors line-clamp-2 mt-1.5"
                >
                  {track.description}
                </button>
              )}
              {(track.description || track.sourcePageUrl) && (
                <button
                  onClick={() => setVaultDetail(track)}
                  className="mt-auto pt-2 text-left text-[7px] font-black uppercase tracking-[0.3em] text-white/20 hover:text-white/50 transition-colors"
                >
                  Details
                </button>
              )}
            </motion.div>
          ))}
        </AdaptiveGrid>

        {/* Recording detail — full context, provenance and a link to the source record */}
        <AnimatePresence>
          {vaultDetail && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] flex items-center justify-center p-4"
              style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)' }}
              onClick={() => setVaultDetail(null)}
            >
              <motion.div
                initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.94, opacity: 0 }}
                onClick={e => e.stopPropagation()}
                className="w-full max-w-lg max-h-[85dvh] overflow-y-auto rounded-3xl p-6 space-y-5"
                style={{ background: '#0d0d14', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <div className="flex items-start gap-4">
                  <div className="w-20 h-20 rounded-2xl overflow-hidden shrink-0" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    {vaultDetail.thumbnailUrl
                      ? <img src={thumb(vaultDetail.thumbnailUrl, THUMB.small) || undefined} onError={onThumbError(vaultDetail.thumbnailUrl)} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Disc size={24} className="text-white/20" /></div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[7px] font-black uppercase tracking-[0.4em] text-small-orange mb-1">
                      {SOURCE_LABEL[vaultDetail.source] ?? vaultDetail.source}
                    </p>
                    <h3 className="text-sm font-black text-white leading-snug">{vaultDetail.title}</h3>
                    <p className="text-[9px] text-white/40 uppercase tracking-widest mt-1">{vaultDetail.artist}</p>
                  </div>
                  <button onClick={() => setVaultDetail(null)} className="shrink-0 text-white/30 hover:text-white"><X size={15} /></button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {vaultDetail.year && <span className="px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest" style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.6)' }}>{vaultDetail.year}</span>}
                  {vaultDetail.kind && <span className="px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest" style={{ background: `${KIND_META[vaultDetail.kind]?.accent ?? '#ff8c00'}22`, color: KIND_META[vaultDetail.kind]?.accent ?? '#ff8c00' }}>{vaultKind(vaultDetail.kind)?.label ?? vaultDetail.kind}</span>}
                  {vaultDetail.subgenre && <span className="px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest" style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.6)' }}>{vaultDetail.subgenre}</span>}
                  {vaultDetail.conservatory && <span className="px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest flex items-center gap-1" style={{ background: 'rgba(56,189,248,0.18)', color: '#7dd3fc' }}><Star size={8} fill="currentColor" /> Conservatory</span>}
                </div>

                {vaultDetail.description && (
                  <div>
                    <p className="text-[7px] font-black uppercase tracking-[0.4em] text-white/25 mb-1.5">About this recording</p>
                    <p className="text-[11px] text-white/65 leading-relaxed whitespace-pre-wrap">{vaultDetail.description}</p>
                  </div>
                )}
                {vaultDetail.context && (
                  <div>
                    <p className="text-[7px] font-black uppercase tracking-[0.4em] text-white/25 mb-1.5">Provenance</p>
                    <p className="text-[11px] text-white/50 leading-relaxed">{vaultDetail.context}</p>
                  </div>
                )}
                {vaultDetail.collection && (
                  <div>
                    <p className="text-[7px] font-black uppercase tracking-[0.4em] text-white/25 mb-1.5">Collection</p>
                    <p className="text-[11px] text-white/50 leading-relaxed">{vaultDetail.collection}</p>
                  </div>
                )}
                {vaultDetail.rights && (
                  <div>
                    <p className="text-[7px] font-black uppercase tracking-[0.4em] text-white/25 mb-1.5">Rights</p>
                    <p className="text-[10px] text-white/40 leading-relaxed break-words">{vaultDetail.rights}</p>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => { handlePlayVaultTrack(vaultDetail); setVaultDetail(null); }}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest text-black"
                    style={{ background: 'var(--color-small-orange,#ff8c00)' }}
                  >
                    <Play size={12} fill="currentColor" /> Play
                  </button>
                  {vaultDetail.sourcePageUrl && (
                    <a
                      href={vaultDetail.sourcePageUrl} target="_blank" rel="noopener noreferrer"
                      className="px-4 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all hover:bg-white/10"
                      style={{ border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)' }}
                    >
                      Source record
                    </a>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      {/* External track → playlist picker */}
      <AnimatePresence>
        {externalTrackPicker && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
            onClick={() => setExternalTrackPicker(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="w-80 max-h-[85dvh] overflow-y-auto rounded-3xl p-6 space-y-4"
              style={{ background: '#0d0d14', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <div className="flex items-center gap-3 mb-2">
                {externalTrackPicker.thumbnailUrl && <img src={thumb(externalTrackPicker.thumbnailUrl, THUMB.small) || undefined} onError={onThumbError(externalTrackPicker.thumbnailUrl)} loading="lazy" decoding="async" className="w-10 h-10 rounded-xl object-cover shrink-0" />}
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-widest truncate">{externalTrackPicker.title}</p>
                  <p className="text-[9px] text-white/40 uppercase tracking-widest truncate">{externalTrackPicker.artist}</p>
                </div>
                <button onClick={() => setExternalTrackPicker(null)} className="shrink-0 ml-auto text-white/30 hover:text-white"><X size={14} /></button>
              </div>
              <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Add to playlist</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {personalPlaylists.map(pl => (
                  <button key={pl.id}
                    onClick={() => handleAddExternalToPlaylist(externalTrackPicker, pl.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-all hover:bg-white/[0.06]"
                    style={{ border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    {pl.coverImage || pl.coverUrl
                      ? <img src={thumb(pl.coverImage ?? pl.coverUrl, THUMB.micro) || undefined} onError={onThumbError(pl.coverImage ?? pl.coverUrl)} loading="lazy" decoding="async" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                      : <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(255,140,0,0.15)' }}><ListMusic size={12} className="text-small-orange" /></div>}
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest truncate">{pl.title}</p>
                      <p className="text-[8px] text-white/30 uppercase tracking-widest">{(pl.trackIds?.length ?? 0) + (pl.tracks?.length ?? 0)} tracks</p>
                    </div>
                    <Plus size={12} className="text-white/30 shrink-0" />
                  </button>
                ))}
              </div>
              <button
                onClick={async () => {
                  const pl = await createPlaylist({ title: `My Mix ${personalPlaylists.length + 1}` });
                  if (pl && (pl as any).id) {
                    setPersonalPlaylists(prev => [pl as any, ...prev]);
                    await handleAddExternalToPlaylist(externalTrackPicker!, (pl as any).id);
                  }
                }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all"
                style={{ background: 'rgba(255,140,0,0.1)', border: '1px dashed rgba(255,140,0,0.3)', color: 'rgba(255,140,0,0.8)' }}
              >
                <Plus size={11} /> New Playlist
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    );
  };

  const renderArchiveArtistInfo = () => {
    const artistTracks = vaultTracks.filter(t => t.artist === selectedArchiveArtist);
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6 md:space-y-12"
      >
        <button
          onClick={() => setSelectedArchiveArtist(null)}
          className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors"
        >
          <ChevronLeft size={14} /> Back to Vault
        </button>

        <div className="flex flex-col md:flex-row gap-6 md:gap-12 items-center md:items-end p-5 sm:p-8 md:p-12 bg-white/[0.03] rounded-3xl md:rounded-[3rem] border border-white/5">
          <div className="w-40 h-40 sm:w-52 sm:h-52 md:w-64 md:h-64 rounded-3xl md:rounded-[3rem] overflow-hidden border-4 border-white/10 shadow-3xl shrink-0 bg-black">
            <img src={thumb(artistTracks[0]?.thumbnailUrl, THUMB.large) || undefined} onError={onThumbError(artistTracks[0]?.thumbnailUrl)} className="w-full h-full object-cover opacity-50" loading="lazy" decoding="async" />
          </div>
          <div className="text-center md:text-left">
            <div className="flex items-center gap-3 justify-center md:justify-start mb-4">
              <Archive className="text-small-orange" size={20} />
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-small-orange">Archive Artist</span>
            </div>
            <PageHeader>{selectedArchiveArtist}</PageHeader>
            <p className="text-xs font-bold text-white/40 uppercase tracking-widest max-w-xl">
              This is a historical archive artist. Their works are part of the public domain or Creative Commons, preserved in the global vault.
            </p>
          </div>
        </div>

        <div>
          <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 mb-8">Works in Archive ({artistTracks.length})</h2>
          <AdaptiveGrid phone={2} tablet={3} desktop={5} gap="1rem">
            {artistTracks.map(track => (
              <div key={track.id} className="group cursor-pointer" onClick={() => handlePlayVaultTrack(track)}>
                <div className="aspect-square rounded-2xl overflow-hidden mb-3 border border-white/5 bg-black">
                  <img src={thumb(track.thumbnailUrl, THUMB.small) || undefined} className="w-full h-full object-cover group-hover:scale-110 transition-transform" loading="lazy" decoding="async" />
                </div>
                <h4 className="text-[10px] font-black uppercase tracking-widest truncate">{track.title}</h4>
                <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest">Public Domain</p>
              </div>
            ))}
          </AdaptiveGrid>
        </div>
      </motion.div>
    );
  };

  // ── Audius Artist Page overlay ─────────────────────────────────────────────
  if (selectedAudiusArtist) {
    return (
      <div className="flex-1 bg-transparent text-white overflow-y-auto custom-scrollbar pb-40">
        <Suspense fallback={
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
          </div>
        }>
          <AudiusArtistPage
            artist={selectedAudiusArtist}
            onBack={() => setSelectedAudiusArtist(null)}
            onSelectAlbum={(album) => openAudiusAlbumNative(album)}
          />
        </Suspense>
      </div>
    );
  }

  // ── Audius Album/Playlist view overlay ─────────────────────────────────────
  if (selectedAudiusAlbum) {
    return (
      <div className="flex-1 bg-transparent text-white overflow-y-auto custom-scrollbar pb-40">
        <Suspense fallback={
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
          </div>
        }>
          <AudiusAlbumView
            album={selectedAudiusAlbum}
            onBack={() => setSelectedAudiusAlbum(null)}
            onViewArtist={(artist) => { setSelectedAudiusArtist(artist); setSelectedAudiusAlbum(null); }}
          />
        </Suspense>
      </div>
    );
  }

  // ── Chora Conservatory overlay ─────────────────────────────────────────────
  if (showConservatory) {
    return (
      <Suspense fallback={
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#E0A458]/30 border-t-[#E0A458] rounded-full animate-spin" />
        </div>
      }>
        <ChoraConservatory onBack={() => setShowConservatory(false)} />
      </Suspense>
    );
  }

  return (
    <div className="flex-1 bg-transparent text-white overflow-y-auto custom-scrollbar pb-40 relative">
      {bgAlbums.length > 0 && (
        <div className="fixed top-0 left-0 w-screen h-[80vh] pointer-events-none" style={{ zIndex: 0, WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 45%, transparent 100%)', maskImage: 'linear-gradient(to bottom, black 0%, black 45%, transparent 100%)' }}>
          <AnimatePresence mode="sync">
            <motion.img
              key={bgAlbums[bgIndex]?.id}
              src={thumb(bgAlbums[bgIndex]?.coverImage, THUMB.large)}
              initial={{ opacity: 0, scale: 1.06 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.8, ease: 'easeInOut' }}
              className="absolute inset-0 w-full h-full object-cover"
            />
          </AnimatePresence>
          <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.45) 40%, rgba(0,0,0,0.7) 70%)' }} />
        </div>
      )}
      <div className="flex flex-col h-full relative z-[1]">
        <div className="flex-1 min-w-0">
          <div className="px-4 sm:px-6 lg:px-12 pt-8 mb-6 relative z-10" style={{ opacity: 0.82 }}>
            <PageHeader>Plajah Chora</PageHeader>
            <div className="mt-4">
              <PlajahPlusBanner variant="COMPACT" />
            </div>
            {/* ── World Cup Anthems Banner ─────────────────────────────────── */}
            <WcAnthemBanner onOpenPlaylist={() => { setActiveTab('PLAYLISTS'); }} />
          </div>
          <nav className={`px-4 lg:px-12 mb-6 lg:mb-12 sticky top-0 backdrop-blur-2xl bg-black/40 border-b border-white/20 shadow-[0_4px_30px_rgba(0,0,0,0.5)] z-40 py-3 ${s.nav} transition-all duration-500`}>
            {/* Row 1: swipeable tabs — always full-width */}
            <div className="flex items-center gap-6 overflow-x-auto no-scrollbar pb-2">
              {(['NEW', 'FOR_YOU', 'ARTISTS', 'ALBUMS', 'GENRES', 'VAULT', 'PODCASTS', 'AUDIO_BOOKS', 'MY_LIBRARY', 'PLAYLISTS'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); setSelectedArchiveArtist(null); setSelectedAudiusArtist(null); setSelectedAudiusAlbum(null); setShowConservatory(false); }}
                  className={`text-xs font-black uppercase tracking-[0.3em] whitespace-nowrap transition-all pb-1 border-b-2 shrink-0 ${activeTab === tab ? 'text-small-orange border-small-orange' : s.tabInactive}`}
                >
                  {tab === 'VAULT' ? 'The Vault' : tab.replace('_', ' ')}
                </button>
              ))}
            </div>
            {/* Row 2: action buttons — below tabs on mobile, inline on md+ */}
            <div className="flex items-center gap-2 pt-2 md:pt-0 md:absolute md:right-12 md:top-1/2 md:-translate-y-1/2">
              {(activeTab === 'ARTISTS' || activeTab === 'ALBUMS') && (
                <div className="flex items-center bg-white/5 rounded-full p-0.5 border border-white/10">
                  {([['ALL', 'All'], ['CHORA', 'Chora Only'], ['OWNED', 'Owned']] as const).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setSourceFilter(id)}
                      className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                        sourceFilter === id ? 'bg-small-orange text-black shadow-[0_0_12px_rgba(255,140,0,0.4)]' : 'text-white/40 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={toggleAudiusEnabled}
                className="flex items-center gap-2 px-3 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap"
                style={audiusEnabled
                  ? { background: '#7e22ce', color: '#e9d5ff', boxShadow: '0 0 16px rgba(126,34,206,0.5)' }
                  : { background: 'rgba(126,34,206,0.15)', color: 'rgba(168,85,247,0.8)', border: '1px solid rgba(168,85,247,0.3)' }}
              >
                <Music2 size={12} />
                {audiusLoading ? 'Loading…' : 'Audius'}
              </button>
              {userProfile && onNavigate && (
                <button
                  onClick={() => onNavigate('LICENSE_REQUESTS')}
                  title="Filmmakers requesting to license your tracks"
                  className="relative flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 text-white/70 hover:text-white rounded-full text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap"
                >
                  <Film size={12} />
                  <span className="hidden sm:inline">Sync Requests</span>
                  <span className="sm:hidden">Sync</span>
                  {pendingSyncReqs > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 grid place-items-center rounded-full bg-small-orange text-black text-[9px] font-black tabular-nums">{pendingSyncReqs > 9 ? '9+' : pendingSyncReqs}</span>
                  )}
                </button>
              )}
              {onUploadMusic && (
                <button
                  onClick={onUploadMusic}
                  className="flex items-center gap-2 px-3 py-2 bg-small-orange text-black rounded-full text-[9px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-[0_0_16px_rgba(255,140,0,0.4)] whitespace-nowrap"
                >
                  <Upload size={12} />
                  <span className="hidden sm:inline">Upload Music</span>
                  <span className="sm:hidden">Upload</span>
                </button>
              )}
            </div>
          </nav>

          {/* Conservatory + History Moments + Music Theory Studio — below tab bar */}
          {(onNavigate || true) && (
            <div className="flex gap-4 px-4 sm:px-6 lg:px-12 pt-6 pb-2 overflow-x-auto no-scrollbar">
              {/* Chora Conservatory — music museum + history */}
              <button
                onClick={() => setShowConservatory(true)}
                className="shrink-0 relative w-64 h-36 rounded-[1.5rem] overflow-hidden group hover:scale-[1.03] transition-all duration-300 shadow-2xl"
                style={{ border: '1px solid rgba(224,164,88,0.4)' }}
              >
                <img
                  src="https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Johann_Sebastian_Bach.jpg/480px-Johann_Sebastian_Bach.jpg"
                  alt="Conservatory"
                  className="absolute inset-0 w-full h-full object-cover object-top scale-110 group-hover:scale-125 transition-transform duration-500"
                  style={{ filter: 'brightness(0.45) saturate(1.3) sepia(0.25)' }}
                />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(224,164,88,0.35) 0%, transparent 45%, rgba(0,0,0,0.85) 100%)' }} />
                <div className="relative h-full flex flex-col justify-between p-4">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#E0A458' }} />
                    <span className="text-[7px] font-black uppercase tracking-[0.35em]" style={{ color: '#E0A458' }}>The Museum</span>
                  </div>
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest mb-0.5" style={{ color: 'rgba(224,164,88,0.85)' }}>Bach to Coltrane to Aretha</p>
                    <h3 className="text-base font-black text-white leading-tight">The Conservatory</h3>
                    <p className="text-[9px] text-white/50 mt-0.5">Masters &amp; a history of music →</p>
                  </div>
                </div>
              </button>

              {/* History Moments */}
              <button
                onClick={() => onNavigate?.('CHORA_HISTORY')}
                className="shrink-0 relative w-64 h-36 rounded-[1.5rem] overflow-hidden group hover:scale-[1.03] transition-all duration-300 shadow-2xl"
                style={{ border: '1px solid rgba(167,139,250,0.35)' }}
              >
                <img
                  src="https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Johann_Sebastian_Bach.jpg/480px-Johann_Sebastian_Bach.jpg"
                  alt="History"
                  className="absolute inset-0 w-full h-full object-cover object-top scale-110 group-hover:scale-125 transition-transform duration-500"
                  style={{ filter: 'brightness(0.5) saturate(1.4)' }}
                />
                <div className="absolute inset-0 bg-gradient-to-br from-purple-900/70 via-transparent to-black/80" />
                <div className="relative h-full flex flex-col justify-between p-4">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-small-orange animate-pulse" />
                    <span className="text-[7px] font-black uppercase tracking-[0.35em] text-small-orange">Platform Pulse</span>
                  </div>
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-purple-300/80 mb-0.5">Today in Music History</p>
                    <h3 className="text-base font-black text-white leading-tight">History Moments</h3>
                    <p className="text-[9px] text-white/50 mt-0.5">Legends, composers &amp; icons →</p>
                  </div>
                </div>
              </button>

              {/* Music Theory Studio */}
              <button
                onClick={() => onNavigate?.('MUSIC_THEORY')}
                className="shrink-0 relative w-64 h-36 rounded-[1.5rem] overflow-hidden group hover:scale-[1.03] transition-all duration-300 shadow-2xl"
                style={{ border: '1px solid rgba(99,102,241,0.35)' }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/90 via-blue-900/60 to-violet-900/80" />
                <svg className="absolute inset-0 w-full h-full opacity-20" viewBox="0 0 256 144">
                  {[35, 50, 65, 80, 95].map(y => <line key={y} x1="0" y1={y} x2="256" y2={y} stroke="white" strokeWidth="1" />)}
                  <text x="10" y="110" fontSize="80" fill="white" fontFamily="serif" opacity="0.4">𝄞</text>
                  {[[80,65],[115,50],[150,65],[185,50],[220,65]].map(([x, cy], i) => (
                    <ellipse key={i} cx={x} cy={cy} rx="7" ry="5" fill="white" opacity="0.6" transform={`rotate(-15,${x},${cy})`} />
                  ))}
                </svg>
                <div className="relative h-full flex flex-col justify-between p-4">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    <span className="text-[7px] font-black uppercase tracking-[0.35em] text-cyan-400">Learn</span>
                  </div>
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-blue-300/80 mb-0.5">Novice · Intermediate · Maestro</p>
                    <h3 className="text-base font-black text-white leading-tight">Music Theory Studio</h3>
                    <p className="text-[9px] text-white/50 mt-0.5">Ear training, scales &amp; harmony →</p>
                  </div>
                </div>
              </button>
            </div>
          )}

          {activeTab === 'NEW' && !selectedArchiveArtist && (
            <div className="px-4 sm:px-6 lg:px-12 pt-8 mb-6">
              <h1 style={{ fontSize: 'clamp(2.5rem, 12vw, 12rem)' }} className="break-words font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none mb-6 sm:mb-12">New</h1>
              <AdaptiveGrid phone={1} tablet={2} desktop={3} gap="2rem">
              <div className="lg:col-span-2 space-y-12">

                {/* ── Coming Soon ── */}
                {upcomingAlbums.length > 0 && (
                  <section className="animate-in fade-in duration-500">
                    <div className="flex items-center gap-3 mb-6">
                      <span className="w-0.5 h-4 rounded-full bg-gradient-to-b from-small-orange to-[#D40055] shrink-0" />
                      <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white">Coming Soon</h2>
                      <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                    </div>
                    <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1">
                      {upcomingAlbums.map(album => (
                        <motion.div key={album.id} whileHover={{ y: -5, scale: 1.02 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                          onClick={() => onSelectAlbum(album)}
                          className="flex-shrink-0 w-44 cursor-pointer group">
                          <div className="relative aspect-square rounded-[1.5rem] overflow-hidden mb-3 border border-white/5 shadow-2xl">
                            <img src={thumb(album.coverImage, THUMB.card)} onError={onThumbError(album.coverImage)} className="w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-700" loading="lazy" />
                            <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.88) 100%)' }} />
                            <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full text-[7px] font-black uppercase tracking-widest"
                              style={{ background: 'rgba(255,140,0,0.92)', color: '#000' }}>
                              <Clock size={8} /> {timeUntil(album.releaseDate!)}
                            </div>
                            <div className="absolute bottom-3 inset-x-3 text-center">
                              <p className="text-[8px] font-black text-white/60 uppercase tracking-widest">
                                {fmtDate(album.releaseDate!)}
                              </p>
                            </div>
                          </div>
                          <h4 className="text-[10px] font-black uppercase tracking-widest truncate group-hover:text-small-orange transition-colors">{album.title}</h4>
                          <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest truncate">{album.artist}</p>
                        </motion.div>
                      ))}
                    </div>
                  </section>
                )}

                <section>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Recent Releases</h2>
                  </div>
                  <AdaptiveGrid phone={1} tablet={2} desktop={3} gap="1.5rem">
                    {albums.slice(0, 8).map((album) => (
                      <div key={album.id} onClick={() => onSelectAlbum(album)} className="group cursor-pointer">
                        <div className="aspect-square rounded-[2rem] overflow-hidden mb-3 border border-white/5 shadow-2xl relative">
                          <ThreeDImage src={thumb(album.coverImage, THUMB.card)} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <PlayCircle size={48} className="text-small-orange" />
                          </div>
                          {album.coverImage && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setAlbum3D(album); }}
                              className="absolute top-2 right-2 p-2 bg-black/60 backdrop-blur-md rounded-full text-cyan-400 opacity-0 group-hover:opacity-100 hover:scale-110 transition-all z-10"
                            >
                              <Layers size={12} />
                            </button>
                          )}
                        </div>
                        <h4 className="text-xs font-black uppercase tracking-widest truncate">{album.title}</h4>
                        <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest truncate">{album.artist}</p>
                      </div>
                    ))}
                  </AdaptiveGrid>
                </section>

                <section>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Discover Artists</h2>
                  </div>
                  <FeaturedCarousel items={artists.slice(0, 5).map(artist => ({ id: artist.uid, title: artist.displayName, subtitle: "Featured Artist", imageUrl: artist.coverArt || artist.featuredArtistPhoto || artist.photoURL || `https://picsum.photos/seed/${artist.uid}/1280/720`, onClick: () => onVisitUser(artist.uid, 'CONTENT') }))} />
                </section>
                
                {/* ── Audius Trending ── */}
                {audiusEnabled && audiusCuration && audiusCuration.trending.length > 0 && (
                  <section className="animate-in fade-in duration-500">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: '#7e22ce' }}><Music2 size={10} className="text-purple-200" /></div>
                      <h2 className="text-[10px] font-black uppercase tracking-[0.4em]" style={{ color: '#a855f7' }}>Audius Trending</h2>
                      <span className="text-[8px] font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(126,34,206,0.2)', color: '#c084fc' }}>Decentralized</span>
                    </div>
                    <AdaptiveGrid phone={2} tablet={3} desktop={4} gap="1rem">
                      {audiusCuration.trending.slice(0, 10).map(track => (
                        <motion.div key={track.id} whileHover={{ y: -4 }}
                          className="group cursor-pointer rounded-2xl p-3 transition-all"
                          style={{ background: 'rgba(126,34,206,0.08)', border: '1px solid rgba(168,85,247,0.15)' }}
                          onClick={() => handlePlayVaultTrack(track)}>
                          <div className="aspect-square rounded-xl overflow-hidden mb-3 relative">
                            <img src={thumb(track.thumbnailUrl, THUMB.small)} className="w-full h-full object-cover group-hover:scale-110 transition-transform" loading="lazy" />
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
                              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#7e22ce' }}><Play size={14} fill="currentColor" className="text-purple-100 ml-0.5" /></div>
                            </div>
                            <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[6px] font-black" style={{ background: 'rgba(126,34,206,0.85)', color: '#e9d5ff' }}>AUDIUS</div>
                          </div>
                          <div className="flex items-center justify-between gap-1 mt-0.5">
                            <p className="text-[8px] truncate" style={{ color: 'rgba(168,85,247,0.7)' }}>{track.artist}</p>
                            {personalPlaylists.length > 0 && (
                              <button onClick={e => { e.stopPropagation(); setExternalTrackPicker(track); }}
                                className="tap shrink-0 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{ background: 'rgba(126,34,206,0.3)' }}>
                                <Plus size={9} style={{ color: '#c084fc' }} />
                              </button>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </AdaptiveGrid>
                  </section>
                )}

                {/* ── Audius Playlists ── */}
                {audiusEnabled && audiusCuration && audiusCuration.playlists.length > 0 && (
                  <section className="animate-in fade-in duration-500">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: '#7e22ce' }}><ListMusic size={10} className="text-purple-200" /></div>
                      <h2 className="text-[10px] font-black uppercase tracking-[0.4em]" style={{ color: '#a855f7' }}>Audius Featured Playlists</h2>
                    </div>
                    <AdaptiveGrid phone={2} tablet={4} desktop={6} gap="1rem">
                      {audiusCuration.playlists.map(pl => (
                        <motion.div key={pl.id} whileHover={{ y: -4 }}
                          className="group cursor-pointer rounded-2xl p-3 transition-all"
                          style={{ background: 'rgba(126,34,206,0.08)', border: '1px solid rgba(168,85,247,0.15)' }}
                          onClick={() => handlePlayAudiusPlaylist(pl)}>
                          <div className="aspect-square rounded-xl overflow-hidden mb-3 relative">
                            {pl.artworkUrl ? <img src={thumb(pl.artworkUrl, THUMB.card) || undefined} onError={onThumbError(pl.artworkUrl)} className="w-full h-full object-cover group-hover:scale-110 transition-transform" loading="lazy" decoding="async" /> : <div className="w-full h-full flex items-center justify-center" style={{ background: 'rgba(126,34,206,0.3)' }}><ListMusic size={24} style={{ color: '#a855f7' }} /></div>}
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
                              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#7e22ce' }}><Play size={14} fill="currentColor" className="text-purple-100 ml-0.5" /></div>
                            </div>
                          </div>
                          <p className="text-[9px] font-black uppercase tracking-widest truncate">{pl.title}</p>
                          <p className="text-[8px] truncate mt-0.5" style={{ color: 'rgba(168,85,247,0.7)' }}>by {pl.curator} · {pl.trackCount} tracks</p>
                        </motion.div>
                      ))}
                    </AdaptiveGrid>
                  </section>
                )}

                {/* ── Audius Underground ── */}
                {audiusEnabled && audiusCuration && audiusCuration.underground.length > 0 && (
                  <section className="animate-in fade-in duration-500">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: '#7e22ce' }}><Zap size={10} className="text-purple-200" /></div>
                      <h2 className="text-[10px] font-black uppercase tracking-[0.4em]" style={{ color: '#a855f7' }}>Audius Underground</h2>
                    </div>
                    <div className="space-y-1">
                      {audiusCuration.underground.slice(0, 8).map((track, idx) => (
                        <div key={track.id} onClick={() => handlePlayVaultTrack(track)}
                          className="flex items-center gap-4 p-3 rounded-xl cursor-pointer group transition-all hover:bg-purple-900/20">
                          <span className="text-lg font-black w-6 text-center shrink-0" style={{ color: 'rgba(168,85,247,0.4)' }}>#{idx + 1}</span>
                          <img src={thumb(track.thumbnailUrl, THUMB.small)} className="w-10 h-10 rounded-lg object-cover shrink-0" loading="lazy" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-widest truncate group-hover:text-purple-400 transition-colors">{track.title}</p>
                            <p className="text-[8px] truncate" style={{ color: 'rgba(168,85,247,0.6)' }}>{track.artist} {track.genre ? `· ${track.genre}` : ''}</p>
                          </div>
                          <Play size={12} style={{ color: 'rgba(168,85,247,0.5)' }} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {curatedPlaylists.length > 0 && (
                  <section className="animate-in fade-in duration-700">
                    <div className="flex items-center gap-3 mb-6">
                      <Sparkles className="text-small-orange" size={20} />
                      <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white">Staff Pick Playlists</h2>
                    </div>
                    <AdaptiveGrid phone={2} tablet={3} desktop={4} gap="1.5rem">
                      {curatedPlaylists.map(pl => (
                        <button
                          key={pl.id} 
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onSelectAlbum({
                              id: pl.id,
                              ownerId: pl.ownerId,
                              title: pl.title,
                              artist: pl.authorName || 'Curator',
                              coverImage: pl.coverImage || '',
                              tracks: pl.tracks || [],
                              type: 'MUSIC',
                              subType: 'PLAYLIST',
                              createdAt: pl.timestamp,
                              isPublic: true
                            } as any);
                          }}
                          className="group text-left cursor-pointer p-3 bg-white/[0.03] border border-white/5 rounded-3xl hover:bg-white/[0.08] transition-all"
                        >
                           <div className="aspect-square rounded-2xl overflow-hidden mb-4 bg-black/40 flex items-center justify-center p-4 group-hover:scale-[1.02] transition-transform">
                              {pl.coverImage ? (
                                  <img src={thumb(pl.coverImage, THUMB.card) || undefined} className="w-full h-full object-cover rounded-xl pointer-events-none" loading="lazy" decoding="async" />
                              ) : (
                                  <ListMusic size={32} className="text-white/10 group-hover:text-small-orange transition-colors" />
                              )}
                           </div>
                           <h4 className="text-xs font-black uppercase tracking-widest truncate mb-1">{pl.title}</h4>
                           <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest truncate">by {pl.authorName}</p>
                        </button>
                      ))}
                    </AdaptiveGrid>
                  </section>
                )}
              </div>

              <div className="space-y-8 flex flex-col">

                {/* ── History Moment Pulse ── */}
                <HistoryMomentPulseCard
                  uid={auth.currentUser?.uid}
                  category="MUSIC"
                  size="sidebar"
                  onNavigate={onNavigate}
                  rotationIntervalSeconds={12}
                />

                {/* ── Platform Pulse ── */}
                {upcomingAlbums.length > 0 && (
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`pulse-${pulseIdx}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                      className="relative rounded-[2rem] overflow-hidden cursor-pointer group"
                      style={{ border: '1px solid rgba(255,140,0,0.2)' }}
                      onClick={() => onSelectAlbum(upcomingAlbums[pulseIdx])}
                    >
                      {/* Blurred bg */}
                      <img
                        src={upcomingAlbums[pulseIdx].coverImage}
                        className="absolute inset-0 w-full h-full object-cover scale-125"
                        style={{ filter: 'blur(24px) brightness(0.28) saturate(2.2)' }}
                      />
                      <div className="relative p-5">
                        {/* Header row */}
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-1.5 h-1.5 rounded-full bg-small-orange animate-pulse shrink-0" />
                          <span className="text-[8px] font-black uppercase tracking-[0.35em] text-small-orange">Platform Pulse</span>
                          {upcomingAlbums.length > 1 && (
                            <div className="ml-auto flex gap-1">
                              {upcomingAlbums.slice(0, 5).map((_, i) => (
                                <div key={i} className="w-1 h-1 rounded-full transition-all duration-300"
                                  style={{ background: i === pulseIdx ? '#ff8c00' : 'rgba(255,255,255,0.2)', transform: i === pulseIdx ? 'scale(1.4)' : 'scale(1)' }} />
                              ))}
                            </div>
                          )}
                        </div>
                        {/* Cover + info */}
                        <div className="flex gap-3 items-start">
                          <img
                            src={thumb(upcomingAlbums[pulseIdx].coverImage, THUMB.small) || undefined}
                            onError={onThumbError(upcomingAlbums[pulseIdx].coverImage)}
                            loading="lazy"
                            decoding="async"
                            className="w-16 h-16 rounded-xl object-cover shrink-0 shadow-xl group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-[8px] text-white/45 uppercase tracking-widest font-bold mb-0.5 truncate">{upcomingAlbums[pulseIdx].artist}</p>
                            <h4 className="text-sm font-black uppercase tracking-tight text-white leading-tight mb-2 truncate">{upcomingAlbums[pulseIdx].title}</h4>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[9px] font-black px-2 py-0.5 rounded-full"
                                style={{ background: 'rgba(255,140,0,0.18)', color: '#ff8c00', border: '1px solid rgba(255,140,0,0.3)' }}>
                                {timeUntil(upcomingAlbums[pulseIdx].releaseDate!)}
                              </span>
                              <span className="text-[8px] text-white/25 font-bold">{fmtDate(upcomingAlbums[pulseIdx].releaseDate!)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </AnimatePresence>
                )}

                {/* ── Sponsored · Upcoming Releases ── */}
                {upcomingAlbums.length > 0 && (
                  <div>
                    <p className="text-[7px] font-black uppercase tracking-[0.35em] text-white/18 mb-2 pl-1">Sponsored · Upcoming</p>
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={`sponsored-${sponsoredIdx}`}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                        className="relative rounded-[2rem] overflow-hidden cursor-pointer aspect-[3/4] group shadow-2xl"
                        onClick={() => onSelectAlbum(upcomingAlbums[sponsoredIdx])}
                      >
                        <img
                          src={thumb(upcomingAlbums[sponsoredIdx].coverImage, THUMB.card) || undefined}
                          onError={onThumbError(upcomingAlbums[sponsoredIdx].coverImage)}
                          loading="lazy"
                          decoding="async"
                          className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-700"
                        />
                        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, transparent 25%, rgba(0,0,0,0.88) 100%)' }} />

                        {/* Pagination dots */}
                        {upcomingAlbums.length > 1 && (
                          <div className="absolute top-4 right-4 flex gap-1.5">
                            {upcomingAlbums.slice(0, 5).map((_, i) => (
                              <div key={i} className="w-1.5 h-1.5 rounded-full transition-all duration-300"
                                style={{ background: i === sponsoredIdx ? '#ff8c00' : 'rgba(255,255,255,0.3)', transform: i === sponsoredIdx ? 'scale(1.3)' : 'scale(1)' }} />
                            ))}
                          </div>
                        )}

                        <div className="absolute inset-x-0 bottom-0 p-5">
                          <span className="inline-flex items-center gap-1 text-[7px] font-black px-2 py-1 rounded-full mb-3"
                            style={{ background: 'rgba(255,140,0,0.92)', color: '#000' }}>
                            <Clock size={8} /> Coming {new Date(upcomingAlbums[sponsoredIdx].releaseDate!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                          <h4 className="text-base font-black uppercase tracking-tight text-white leading-tight">{upcomingAlbums[sponsoredIdx].title}</h4>
                          <p className="text-[9px] text-white/50 uppercase tracking-widest font-bold mt-0.5">{upcomingAlbums[sponsoredIdx].artist}</p>
                          {/* Countdown progress bar */}
                          <div className="mt-4 flex items-center gap-2">
                            <div className="flex-1 h-0.5 bg-white/10 rounded-full overflow-hidden">
                              <motion.div
                                className="h-full rounded-full bg-gradient-to-r from-small-orange to-[#D40055]"
                                initial={{ width: '5%' }}
                                animate={{ width: `${Math.max(5, Math.min(95, 100 - (upcomingAlbums[sponsoredIdx].releaseDate! - Date.now()) / (45 * 86_400_000) * 100))}%` }}
                                transition={{ duration: 1, ease: 'easeOut' }}
                              />
                            </div>
                            <span className="text-[8px] font-black text-small-orange shrink-0">{timeUntil(upcomingAlbums[sponsoredIdx].releaseDate!)}</span>
                          </div>
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                )}

                <div className="bg-white/[0.02] border border-white/5 p-6 rounded-[2rem]">
                  <div className="flex items-center gap-2 mb-6">
                    <Zap className="text-small-orange" size={16} />
                    <h3 className="text-xs font-black uppercase tracking-widest">New on Platform</h3>
                  </div>
                  <div className="space-y-4">
                    {artists.slice(5, 10).map((artist) => (
                      <div key={artist.uid} onClick={() => onVisitUser(artist.uid, 'CONTENT')} className="flex items-center gap-4 group cursor-pointer">
                        <img src={thumb(artist.photoURL, THUMB.micro) || `https://picsum.photos/seed/${artist.uid}/200/200`} onError={onThumbError(artist.photoURL)} className="w-12 h-12 rounded-full object-cover group-hover:ring-2 ring-small-orange/50 transition-all" loading="lazy" decoding="async" />
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-widest group-hover:text-small-orange transition-colors">{artist.displayName}</h4>
                          <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">New Artist</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white/[0.02] border border-white/5 p-6 rounded-[2rem] flex-1">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] mb-6 text-white/40">Trending / Top Charts</h3>
                  
                  <h4 className="text-xs font-bold text-white/80 uppercase tracking-widest mb-4">Top Creators</h4>
                  <div className="space-y-4 mb-8">
                    {getSortedArtists().slice(0, 3).map((artist, idx) => (
                      <div key={artist.uid} onClick={() => onVisitUser(artist.uid, 'CONTENT')} className="flex items-center gap-4 group cursor-pointer">
                        <span className="text-lg font-black text-white/20">{idx + 1}</span>
                        <img src={thumb(artist.photoURL, THUMB.micro) || undefined} onError={onThumbError(artist.photoURL)} className="w-10 h-10 rounded-full object-cover" loading="lazy" decoding="async" />
                        <div className="flex-1 truncate">
                          <h5 className="text-[10px] font-black uppercase tracking-widest truncate group-hover:text-small-orange transition-colors">{artist.displayName}</h5>
                          <span className="text-[8px] font-bold text-white/40 uppercase tracking-widest">{artist.followerCount} Fans</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <h4 className="text-xs font-bold text-white/80 uppercase tracking-widest mb-4">Top Songs</h4>
                  <div className="space-y-4">
                    {albums.flatMap(a => a.tracks || []).slice(0, 5).map((track, idx) => (
                       <div key={track.id} className="flex items-center gap-4 group">
                         <span className="text-lg font-black text-white/20 cursor-pointer" onClick={() => playTrack(track, albums.find(a => a.tracks?.some(t => t.id === track.id)) || null, 'LIBRARY')}>{idx + 1}</span>
                         <img src={thumb(track.images?.[0] || track.albumCover, THUMB.micro) || undefined} onError={onThumbError(track.images?.[0] || track.albumCover)} loading="lazy" decoding="async" className="w-10 h-10 rounded-xl object-cover cursor-pointer" onClick={() => playTrack(track, albums.find(a => a.tracks?.some(t => t.id === track.id)) || null, 'LIBRARY')} />
                         <div className="flex-1 truncate cursor-pointer" onClick={() => playTrack(track, albums.find(a => a.tracks?.some(t => t.id === track.id)) || null, 'LIBRARY')}>
                           <h5 className="text-[10px] font-black uppercase tracking-widest truncate group-hover:text-small-orange transition-colors">{track.title}</h5>
                           <div className="flex items-center gap-2">
                             <span className="text-[8px] font-bold text-white/40 uppercase tracking-widest truncate">{track.artist}</span>
                             <span className="text-[9px] font-bold text-white/40 shrink-0">{fmtPlays(trackStats[track.id] ?? 0)} plays</span>
                           </div>
                         </div>
                         <button
                           onClick={e => { e.stopPropagation(); if (!auth.currentUser) { setSignInAction('save to playlists'); } else { setPlaylistPickerTrack(track); } }}
                           className="tap p-1.5 rounded-full bg-white/5 opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all shrink-0"
                           title="Add to playlist"
                         >
                           <Plus size={10} />
                         </button>
                         {/* Share this track — lands on its album page with a 5s auto-play countdown */}
                         <button
                           onClick={e => { e.stopPropagation(); const alb = albums.find(a => a.tracks?.some(t => t.id === track.id)); if (alb) shareTrack(alb.id, track); }}
                           className="tap p-1.5 rounded-full bg-white/5 opacity-0 group-hover:opacity-100 hover:bg-small-orange/20 hover:text-small-orange transition-all shrink-0"
                           title="Share this track"
                         >
                           <Share2 size={10} />
                         </button>
                         {/* The Breakdown */}
                         <button
                           onClick={e => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('OPEN_BREAKDOWN', { detail: { track, album: albums.find(a => a.tracks?.some(t => t.id === track.id)) ?? null } })); }}
                           className="tap hidden sm:flex p-1.5 rounded-full bg-white/5 opacity-0 group-hover:opacity-100 hover:bg-orange-500/20 hover:text-orange-400 transition-all shrink-0"
                           title="The Breakdown — music theory analysis"
                         >
                           <Waves size={10} />
                         </button>
                       </div>
                    ))}
                  </div>
                </div>
              </div>
              </AdaptiveGrid>
            </div>
          )}

          {activeTab === 'FOR_YOU' && !selectedArchiveArtist && userProfile && (
             <div className="px-4 sm:px-6 lg:px-12 pt-8 mb-6 space-y-12 animate-in fade-in">
               <h1 style={{ fontSize: 'clamp(2.5rem, 12vw, 12rem)' }} className="break-words font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none mb-6 sm:mb-12">For You</h1>

               {/* ── Coming Soon ── */}
               {upcomingAlbums.length > 0 && (
                 <section>
                   <div className="flex items-center gap-3 mb-6">
                     <span className="w-0.5 h-4 rounded-full bg-gradient-to-b from-small-orange to-[#D40055] shrink-0" />
                     <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white">Coming Soon</h2>
                     <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                   </div>
                   <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1">
                     {upcomingAlbums.map(album => (
                       <motion.div key={album.id} whileHover={{ y: -5, scale: 1.02 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                         onClick={() => onSelectAlbum(album)}
                         className="flex-shrink-0 w-44 cursor-pointer group">
                         <div className="relative aspect-square rounded-[1.5rem] overflow-hidden mb-3 border border-white/5 shadow-2xl">
                           <img src={thumb(album.coverImage, THUMB.card)} onError={onThumbError(album.coverImage)} className="w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-700" loading="lazy" />
                           <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.88) 100%)' }} />
                           <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full text-[7px] font-black uppercase tracking-widest"
                             style={{ background: 'rgba(255,140,0,0.92)', color: '#000' }}>
                             <Clock size={8} /> {timeUntil(album.releaseDate!)}
                           </div>
                           <div className="absolute bottom-3 inset-x-3 text-center">
                             <p className="text-[8px] font-black text-white/60 uppercase tracking-widest">{fmtDate(album.releaseDate!)}</p>
                           </div>
                         </div>
                         <h4 className="text-[10px] font-black uppercase tracking-widest truncate group-hover:text-small-orange transition-colors">{album.title}</h4>
                         <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest truncate">{album.artist}</p>
                       </motion.div>
                     ))}
                   </div>
                 </section>
               )}

               <section>
                 <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 mb-6">From Authors You Follow</h2>
                 <AdaptiveGrid phone={2} tablet={3} desktop={5} gap="1.5rem">
                   {albums.filter(a => userProfile.following?.includes(a.ownerId || '')).map((album) => (
                     <div key={album.id} onClick={() => onSelectAlbum(album)} className="group cursor-pointer">
                        <div className="aspect-square rounded-[2rem] overflow-hidden mb-3 border border-white/5 shadow-xl relative">
                          <ThreeDImage src={thumb(album.coverImage, THUMB.card)} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                        </div>
                        <h4 className="text-[10px] font-black uppercase tracking-widest truncate">{album.title}</h4>
                        <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest truncate">{album.artist}</p>
                     </div>
                   ))}
                 </AdaptiveGrid>
               </section>

               <section>
                 <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 mb-6">Suggested Creators</h2>
                 <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4 mask-fade-edges">
                    {artists.filter(a => !userProfile.following?.includes(a.uid)).slice(0, 10).map(artist => (
                      <div key={artist.uid} onClick={() => onVisitUser(artist.uid, 'CONTENT')} className="min-w-[140px] text-center group cursor-pointer flex-shrink-0">
                         <div className="aspect-square rounded-full overflow-hidden mb-4 border-2 border-white/5 p-1 relative">
                            <img src={thumb(artist.photoURL, THUMB.card) || undefined} onError={onThumbError(artist.photoURL)} className="w-full h-full object-cover rounded-full group-hover:scale-110 transition-transform" loading="lazy" decoding="async" />
                         </div>
                         <h4 className="text-[10px] font-black uppercase tracking-widest truncate">{artist.displayName}</h4>
                         <span className="text-[8px] font-bold text-small-orange uppercase tracking-widest bg-small-orange/10 px-2 py-1 rounded-full mt-2 inline-block">Recommended</span>
                      </div>
                    ))}
                 </div>
               </section>
             </div>
          )}

          <div className="px-4 sm:px-6 lg:px-12 space-y-16">
            {selectedArchiveArtist ? renderArchiveArtistInfo() : (
              <>
                {activeTab === 'PODCASTS' && <PodcastsView />}
                {activeTab === 'VAULT' && renderVault()}
                
                {activeTab === 'PLAYLISTS' && (
                  <section className="animate-in fade-in duration-500 space-y-16">
                    <h1 style={{ fontSize: 'clamp(2.5rem, 12vw, 12rem)' }} className="break-words font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Playlists</h1>

                    {/* ── World Cup 2026 National Anthems ── */}
                    <WcAnthemPlaylist onOpenAlbum={onSelectAlbum} />

                    {/* My Playlists */}
                    <div>
                      <div className="flex items-center justify-between mb-6">
                        <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/60">My Playlists</h2>
                        <button
                          onClick={() => { if (!auth.currentUser) { setSignInAction('create playlists'); } else { setCreatingPlaylist(v => !v); } }}
                          className="flex items-center gap-2 px-4 py-2 bg-small-orange text-black rounded-xl text-[9px] font-black uppercase tracking-widest hover:scale-105 transition-transform"
                        >
                          <Plus size={12} /> New Playlist
                        </button>
                      </div>

                      {/* Create form */}
                      <AnimatePresence>
                        {creatingPlaylist && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mb-6 overflow-hidden"
                          >
                            <div className="flex items-center gap-3 p-4 bg-white/[0.04] border border-white/10 rounded-2xl">
                              <input
                                type="text"
                                placeholder="Playlist name..."
                                value={newPlaylistName}
                                onChange={e => setNewPlaylistName(e.target.value)}
                                onKeyDown={async e => {
                                  if (e.key === 'Enter' && newPlaylistName.trim()) {
                                    const pl = await createPlaylist({ title: newPlaylistName.trim(), trackIds: [] });
                                    if (pl) setPersonalPlaylists(prev => [pl, ...prev]);
                                    setNewPlaylistName('');
                                    setCreatingPlaylist(false);
                                  }
                                }}
                                className="flex-1 bg-transparent border-none outline-none text-xs font-bold placeholder:text-white/20"
                                autoFocus
                              />
                              <button
                                onClick={async () => {
                                  if (!newPlaylistName.trim()) return;
                                  const pl = await createPlaylist({ title: newPlaylistName.trim(), trackIds: [] });
                                  if (pl) setPersonalPlaylists(prev => [pl, ...prev]);
                                  setNewPlaylistName('');
                                  setCreatingPlaylist(false);
                                }}
                                className="px-4 py-2 bg-small-orange text-black rounded-xl text-[9px] font-black uppercase tracking-widest"
                              >
                                Create
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {personalPlaylists.length === 0 ? (
                        <div className="p-12 text-center border-dashed border border-white/10 rounded-[2rem]">
                          <ListMusic size={32} className="mx-auto text-white/10 mb-4" />
                          <p className="text-xs font-black uppercase tracking-widest text-white/20">No playlists yet — create one above</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {personalPlaylists.map(pl => (
                            <div key={pl.id} className="bg-white/[0.03] border border-white/5 rounded-2xl overflow-hidden">
                              {/* Playlist header row */}
                              <div className="flex items-center gap-4 p-4">
                                <div
                                  className="w-14 h-14 rounded-xl overflow-hidden bg-white/5 flex items-center justify-center shrink-0 cursor-pointer"
                                  onClick={() => onSelectAlbum({ id: pl.id, ownerId: pl.ownerId, title: pl.title, artist: 'My Playlist', coverImage: pl.coverUrl || pl.coverImage || '', tracks: pl.tracks || [], type: 'MUSIC', subType: 'PLAYLIST', createdAt: pl.timestamp, isPublic: false } as any)}
                                >
                                  {pl.coverUrl || pl.coverImage
                                    ? <img src={thumb(pl.coverUrl || pl.coverImage, THUMB.small) || undefined} onError={onThumbError(pl.coverUrl || pl.coverImage)} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                                    : <ListMusic size={18} className="text-white/20" />
                                  }
                                </div>
                                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onSelectAlbum({ id: pl.id, ownerId: pl.ownerId, title: pl.title, artist: 'My Playlist', coverImage: pl.coverUrl || pl.coverImage || '', tracks: pl.tracks || [], type: 'MUSIC', subType: 'PLAYLIST', createdAt: pl.timestamp, isPublic: false } as any)}>
                                  <h4 className="text-sm font-black uppercase tracking-widest truncate">{pl.title}</h4>
                                  <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest">{pl.trackIds?.length || 0} tracks</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    onClick={() => {
                                      if (pl.tracks?.length) {
                                        const first = pl.tracks[0];
                                        playTrack(first, { id: pl.id, ownerId: pl.ownerId, title: pl.title, artist: 'My Playlist', coverImage: pl.coverUrl || pl.coverImage || '', tracks: pl.tracks, type: 'MUSIC', createdAt: pl.timestamp } as any, 'LIBRARY');
                                      }
                                    }}
                                    className="p-2 rounded-full bg-small-orange text-black hover:scale-110 transition-transform"
                                  >
                                    <Play size={12} fill="currentColor" />
                                  </button>
                                  <button
                                    onClick={() => setOpenPlaylistId(openPlaylistId === pl.id ? null : pl.id)}
                                    className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                                  >
                                    {openPlaylistId === pl.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                  </button>
                                  <button
                                    onClick={async () => {
                                      await deletePlaylist(pl.id);
                                      setPersonalPlaylists(prev => prev.filter(p => p.id !== pl.id));
                                    }}
                                    className="p-2 rounded-full bg-white/5 hover:bg-red-500/20 text-white/30 hover:text-red-400 transition-colors"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>

                              {/* Expanded track list */}
                              <AnimatePresence>
                                {openPlaylistId === pl.id && (
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="overflow-hidden border-t border-white/5"
                                  >
                                    {(pl.tracks || []).length === 0 ? (
                                      <p className="px-6 py-4 text-[10px] font-bold text-white/20 uppercase tracking-widest">No tracks yet — add from any song</p>
                                    ) : (
                                      (pl.tracks || []).map((track, idx) => (
                                        <div key={track.id} className="flex items-center gap-4 px-4 py-3 hover:bg-white/[0.03] transition-colors group border-b border-white/[0.03] last:border-0">
                                          <span className="text-sm font-black text-white/10 w-6 text-center shrink-0">{idx + 1}</span>
                                          <img src={thumb(track.images?.[0] || track.albumCover, THUMB.micro) || undefined} onError={onThumbError(track.images?.[0] || track.albumCover)} className="w-10 h-10 rounded-xl object-cover border border-white/5 shrink-0" loading="lazy" decoding="async" />
                                          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => playTrack(track, { id: pl.id, ownerId: pl.ownerId, title: pl.title, artist: 'My Playlist', coverImage: pl.coverUrl || pl.coverImage || '', tracks: pl.tracks || [], type: 'MUSIC', createdAt: pl.timestamp } as any, 'LIBRARY')}>
                                            <h5 className="text-xs font-black uppercase tracking-widest truncate group-hover:text-small-orange transition-colors">{track.title}</h5>
                                            <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest truncate">{track.artist}</p>
                                          </div>
                                          <span className="text-[9px] font-bold text-white/40 shrink-0">{fmtPlays(trackStats[track.id] ?? 0)} plays</span>
                                          <button
                                            onClick={e => { e.stopPropagation(); const albId = (track as any).albumId || albums.find(a => a.tracks?.some(t => t.id === track.id))?.id; if (albId) shareTrack(albId, track); }}
                                            className="p-1.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-small-orange/20 text-white/30 hover:text-small-orange transition-all shrink-0"
                                            title="Share this track"
                                          >
                                            <Share2 size={10} />
                                          </button>
                                          <button
                                            onClick={async () => {
                                              await removeTrackFromPlaylist(pl.id, track.id);
                                              setPersonalPlaylists(prev => prev.map(p => p.id === pl.id ? { ...p, tracks: (p.tracks || []).filter(t => t.id !== track.id), trackIds: (p.trackIds || []).filter(id => id !== track.id) } : p));
                                            }}
                                            className="p-1.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-white/30 hover:text-red-400 transition-all shrink-0"
                                          >
                                            <Trash2 size={10} />
                                          </button>
                                        </div>
                                      ))
                                    )}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Staff Pick Playlists */}
                    {curatedPlaylists.length > 0 && (
                      <div>
                        <div className="flex items-center gap-3 mb-6">
                          <Sparkles size={14} className="text-small-orange" />
                          <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/60">Staff Picks</h2>
                        </div>
                        <AdaptiveGrid phone={2} tablet={3} desktop={4} gap="1.5rem">
                          {curatedPlaylists.map(pl => (
                            <div
                              key={pl.id}
                              onClick={() => onSelectAlbum({ id: pl.id, ownerId: pl.ownerId, title: pl.title, artist: pl.authorName || 'Curator', coverImage: pl.coverImage || '', tracks: pl.tracks || [], type: 'MUSIC', subType: 'PLAYLIST', createdAt: pl.timestamp, isPublic: true } as any)}
                              className="group cursor-pointer p-4 bg-white/[0.03] border border-white/5 rounded-3xl hover:bg-white/[0.08] transition-all text-center"
                            >
                              <div className="aspect-square rounded-2xl overflow-hidden mb-4 bg-black/40 flex items-center justify-center group-hover:scale-[1.02] transition-transform">
                                {pl.coverImage
                                  ? <img src={thumb(pl.coverImage, THUMB.card) || undefined} onError={onThumbError(pl.coverImage)} className="w-full h-full object-cover rounded-xl" loading="lazy" decoding="async" />
                                  : <ListMusic size={48} className="text-white/10 group-hover:text-small-orange transition-colors" />
                                }
                              </div>
                              <h4 className="text-sm font-black uppercase tracking-widest truncate mb-2">{pl.title}</h4>
                              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest truncate">by {pl.authorName}</p>
                              <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest mt-2">{pl.tracks?.length || 0} Tracks</p>
                            </div>
                          ))}
                        </AdaptiveGrid>
                      </div>
                    )}
                  </section>
                )}

                {activeTab === 'ARTISTS' && (
                  <section className="animate-in fade-in duration-500 space-y-16">
                    <div className="flex items-center justify-between">
                      <h1 style={{ fontSize: 'clamp(2.5rem, 12vw, 12rem)' }} className="break-words font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Artists</h1>
                      <button onClick={() => setSortOrder(sortOrder === 'RECENT' ? 'ALPHA' : 'RECENT')} className="p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition-all flex items-center gap-2">
                        <ArrowUpDown size={16} />
                        <span className="text-[9px] font-black uppercase tracking-widest">{sortOrder === 'RECENT' ? 'Recently Joined' : 'Alphabetical'}</span>
                      </button>
                    </div>

                    {/* Trending Artists chart */}
                    {sourceFilter !== 'OWNED' && (
                    <div>
                      <div className="flex items-center gap-3 mb-6">
                        <Flame size={16} className="text-small-orange" />
                        <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/60">Trending Artists</h2>
                      </div>
                      <div className="space-y-2">
                        {[...artists].sort((a, b) => (b.followerCount || 0) - (a.followerCount || 0)).slice(0, 10).map((artist, idx) => (
                          <div key={artist.uid} onClick={() => onVisitUser(artist.uid, 'CONTENT')} className="flex items-center gap-5 p-4 rounded-2xl hover:bg-white/[0.04] transition-colors group cursor-pointer">
                            <span className="text-2xl font-black text-white/10 w-8 text-center shrink-0">#{idx + 1}</span>
                            <img src={thumb(artist.photoURL, THUMB.micro) || undefined} onError={onThumbError(artist.photoURL)} className="w-12 h-12 rounded-full object-cover border border-white/10 shrink-0" loading="lazy" decoding="async" />
                            <div className="flex-1 min-w-0">
                              <h4 className="text-xs font-black uppercase tracking-widest truncate group-hover:text-small-orange transition-colors">{artist.displayName}</h4>
                              <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest">{(artist.followerCount || 0).toLocaleString()} Fans</p>
                            </div>
                            {idx === 0 && <span className="px-3 py-1 bg-small-orange/20 text-small-orange text-[8px] font-black uppercase tracking-widest rounded-full">Top</span>}
                          </div>
                        ))}
                      </div>
                    </div>

                    )}

                    {/* Full grid */}
                    <div>
                      <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 mb-6">{sourceFilter === 'OWNED' ? 'Your Artists' : 'All Artists'}</h2>
                      {sourceFilter === 'OWNED' && visibleArtists().length === 0 && (
                        <p className="text-[10px] text-white/30 uppercase tracking-widest py-8">No artists in your library yet. Upload music to your Locker to see them here.</p>
                      )}
                      <AdaptiveGrid phone={2} tablet={3} desktop={6} gap="1.5rem">
                        {visibleArtists().map(artist => (
                          <div key={artist.uid} onClick={() => handleArtistCardClick(artist)} className="group cursor-pointer text-center">
                            <div className="aspect-square rounded-[2rem] overflow-hidden mb-4 border border-white/5 relative">
                              <img src={thumb(artist.photoURL, THUMB.card) || undefined} onError={onThumbError(artist.photoURL)} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" loading="lazy" decoding="async" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <User size={32} className="text-white" />
                              </div>
                            </div>
                            <h4 className="text-xs font-black uppercase tracking-widest truncate">{artist.displayName}</h4>
                            <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">{artist.followerCount} Fans</p>
                          </div>
                        ))}
                      </AdaptiveGrid>
                    </div>

                    {/* ── Audius Artists ── */}
                    {sourceFilter !== 'OWNED' && audiusEnabled && audiusCuration && audiusCuration.artists.length > 0 && (
                      <div>
                        <div className="flex items-center gap-3 mb-6 mt-4 pt-8 border-t border-purple-900/30">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: '#7e22ce' }}><User size={10} className="text-purple-200" /></div>
                          <h2 className="text-[10px] font-black uppercase tracking-[0.4em]" style={{ color: '#a855f7' }}>Audius Featured Artists</h2>
                        </div>
                        <AdaptiveGrid phone={2} tablet={3} desktop={6} gap="1.5rem">
                          {audiusCuration.artists.map(artist => (
                            <div key={artist.id}
                              onClick={() => handleOpenAudiusArtist(artist)}
                              className="group cursor-pointer text-center">
                              <div className="aspect-square rounded-[2rem] overflow-hidden mb-4 relative"
                                style={{ border: '1px solid rgba(168,85,247,0.2)' }}>
                                {artist.profilePicture
                                  ? <img src={thumb(artist.profilePicture, THUMB.card) || undefined} onError={onThumbError(artist.profilePicture)} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" loading="lazy" decoding="async" />
                                  : <div className="w-full h-full flex items-center justify-center" style={{ background: 'rgba(126,34,206,0.2)' }}><User size={32} style={{ color: '#a855f7' }} /></div>}
                                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
                                  <Play size={28} style={{ color: '#a855f7' }} />
                                </div>
                                {artist.verified && <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: '#7e22ce' }}><Sparkles size={9} className="text-purple-100" /></div>}
                              </div>
                              <h4 className="text-xs font-black uppercase tracking-widest truncate">{artist.name}</h4>
                              <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'rgba(168,85,247,0.6)' }}>
                                {artist.followerCount.toLocaleString()} followers
                              </p>
                            </div>
                          ))}
                        </AdaptiveGrid>
                      </div>
                    )}
                  </section>
                )}

                {activeTab === 'ALBUMS' && (
                  <section className="animate-in fade-in duration-500 space-y-16">
                    <div className="flex items-center justify-between">
                      <h1 style={{ fontSize: 'clamp(2.5rem, 12vw, 12rem)' }} className="break-words font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Albums</h1>
                      <button onClick={() => setSortOrder(sortOrder === 'RECENT' ? 'ALPHA' : 'RECENT')} className="p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition-all flex items-center gap-2">
                        <ArrowUpDown size={16} />
                        <span className="text-[9px] font-black uppercase tracking-widest">{sortOrder === 'RECENT' ? 'Newest First' : 'Alphabetical'}</span>
                      </button>
                    </div>

                    {/* ── Coming Soon ── */}
                    {sourceFilter !== 'OWNED' && upcomingAlbums.length > 0 && (
                      <div>
                        <div className="flex items-center gap-3 mb-6">
                          <span className="w-0.5 h-4 rounded-full bg-gradient-to-b from-small-orange to-[#D40055] shrink-0" />
                          <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white">Coming Soon</h2>
                          <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                        </div>
                        <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1">
                          {upcomingAlbums.map(album => (
                            <motion.div key={album.id} whileHover={{ y: -5, scale: 1.02 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                              onClick={() => onSelectAlbum(album)}
                              className="flex-shrink-0 w-44 cursor-pointer group">
                              <div className="relative aspect-square rounded-[1.5rem] overflow-hidden mb-3 border border-white/5 shadow-2xl">
                                <img src={thumb(album.coverImage, THUMB.card)} onError={onThumbError(album.coverImage)} className="w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-700" loading="lazy" />
                                <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.88) 100%)' }} />
                                <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full text-[7px] font-black uppercase tracking-widest"
                                  style={{ background: 'rgba(255,140,0,0.92)', color: '#000' }}>
                                  <Clock size={8} /> {timeUntil(album.releaseDate!)}
                                </div>
                                <div className="absolute bottom-3 inset-x-3 text-center">
                                  <p className="text-[8px] font-black text-white/60 uppercase tracking-widest">{fmtDate(album.releaseDate!)}</p>
                                </div>
                              </div>
                              <h4 className="text-[10px] font-black uppercase tracking-widest truncate group-hover:text-small-orange transition-colors">{album.title}</h4>
                              <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest truncate">{album.artist}</p>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Top Charts */}
                    {sourceFilter !== 'OWNED' && trendingAlbums.length > 0 && (
                      <div>
                        <div className="flex items-center gap-3 mb-6">
                          <BarChart2 size={16} className="text-small-orange" />
                          <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/60">Top Charts</h2>
                        </div>
                        <div className="space-y-2">
                          {trendingAlbums.map((album, idx) => (
                            <div key={album.id} onClick={() => onSelectAlbum(album)} className="flex items-center gap-5 p-4 rounded-2xl hover:bg-white/[0.04] transition-colors group cursor-pointer">
                              <span className={`text-2xl font-black w-8 text-center shrink-0 ${idx < 3 ? 'text-small-orange' : 'text-white/10'}`}>#{idx + 1}</span>
                              <img src={thumb(album.coverImage, THUMB.small) || undefined} onError={onThumbError(album.coverImage)} className="w-12 h-12 rounded-xl object-cover border border-white/10 shrink-0" loading="lazy" decoding="async" />
                              <div className="flex-1 min-w-0">
                                <h4 className="text-xs font-black uppercase tracking-widest truncate group-hover:text-small-orange transition-colors">{album.title}</h4>
                                <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest truncate">{album.artist}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-black text-white/80">{fmtPlays(album.playCount ?? 0)}</p>
                                <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">plays</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* All albums grid */}
                    <div>
                      <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 mb-6">{sourceFilter === 'OWNED' ? 'Your Albums' : 'All Albums'}</h2>
                      {sourceFilter === 'OWNED' && visibleAlbums().length === 0 && (
                        <p className="text-[10px] text-white/30 uppercase tracking-widest py-8">Nothing in your library yet. Upload music to your Locker to see it here.</p>
                      )}
                      <AdaptiveGrid phone={2} tablet={3} desktop={5} gap="1.5rem">
                        {visibleAlbums().map(album => (
                          <div key={album.id} onClick={() => onSelectAlbum(album)} className="group cursor-pointer">
                            <div className="aspect-square rounded-3xl overflow-hidden mb-4 shadow-2xl border border-white/5 relative">
                              <ThreeDImage src={thumb(album.coverImage, THUMB.card)} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                              <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-1 bg-black/70 backdrop-blur-sm rounded-lg">
                                <HeadphonesIcon size={9} className="text-white/70" />
                                <span className="text-[9px] font-black text-white/70">{fmtPlays(album.playCount ?? 0)}</span>
                              </div>
                            </div>
                            <h4 className="text-xs font-black uppercase tracking-widest truncate">{album.title}</h4>
                            <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">{album.artist}</p>
                          </div>
                        ))}
                      </AdaptiveGrid>
                    </div>

                    {/* ── Audius Playlists in ALBUMS tab ── */}
                    {sourceFilter !== 'OWNED' && audiusEnabled && audiusCuration && audiusCuration.playlists.length > 0 && (
                      <div>
                        <div className="flex items-center gap-3 mb-6 pt-8 border-t border-purple-900/30">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: '#7e22ce' }}><ListMusic size={10} className="text-purple-200" /></div>
                          <h2 className="text-[10px] font-black uppercase tracking-[0.4em]" style={{ color: '#a855f7' }}>Audius Playlists</h2>
                          <span className="text-[8px] font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(126,34,206,0.2)', color: '#c084fc' }}>Decentralized</span>
                        </div>
                        <AdaptiveGrid phone={2} tablet={3} desktop={5} gap="1.5rem">
                          {audiusCuration.playlists.map(pl => (
                            <motion.div key={pl.id} whileHover={{ scale: 1.02 }}
                              onClick={() => handlePlayAudiusPlaylist(pl)}
                              className="group cursor-pointer">
                              <div className="aspect-square rounded-3xl overflow-hidden mb-4 shadow-2xl relative"
                                style={{ border: '1px solid rgba(168,85,247,0.2)' }}>
                                {pl.artworkUrl
                                  ? <img src={thumb(pl.artworkUrl, THUMB.card) || undefined} onError={onThumbError(pl.artworkUrl)} className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" decoding="async" />
                                  : <div className="w-full h-full flex items-center justify-center" style={{ background: 'rgba(126,34,206,0.2)' }}><ListMusic size={40} style={{ color: '#a855f7' }} /></div>}
                                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
                                  <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: '#7e22ce' }}><Play size={20} fill="currentColor" className="text-purple-100 ml-1" /></div>
                                </div>
                                <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: 'rgba(0,0,0,0.7)' }}>
                                  <HeadphonesIcon size={9} style={{ color: 'rgba(168,85,247,0.8)' }} />
                                  <span className="text-[9px] font-black" style={{ color: 'rgba(168,85,247,0.8)' }}>{pl.trackCount} tracks</span>
                                </div>
                              </div>
                              <h4 className="text-xs font-black uppercase tracking-widest truncate">{pl.title}</h4>
                              <p className="text-[9px] font-bold uppercase tracking-widest truncate" style={{ color: 'rgba(168,85,247,0.6)' }}>by {pl.curator}</p>
                            </motion.div>
                          ))}
                        </AdaptiveGrid>
                      </div>
                    )}
                  </section>
                )}

                {activeTab === 'GENRES' && (
                  <section className="animate-in fade-in duration-500">
                    <h1 style={{ fontSize: 'clamp(2.5rem, 12vw, 12rem)' }} className="break-words font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none mb-6 sm:mb-12">Genres</h1>
                    <div className="space-y-16">
                      {genres.map(genre => {
                        const genreAlbums = albums
                          .filter(a => a.genre?.toLowerCase() === genre.toLowerCase())
                          .sort((a, b) => (b.playCount || 0) - (a.playCount || 0) || b.createdAt - a.createdAt);
                        const vaultGenre = vaultTracks.filter(t => t.genre?.toLowerCase().includes(genre.toLowerCase())).slice(0, 5);
                        const hotAlbum = genreAlbums[0];
                        return (
                          <div key={genre}>
                            <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
                              <div className="flex items-center gap-3">
                                <h3 className="text-xl font-black uppercase tracking-tightest">{genre}</h3>
                                {hotAlbum && (hotAlbum.playCount || 0) > 0 && (
                                  <span className="flex items-center gap-1 px-2 py-0.5 bg-small-orange/15 border border-small-orange/30 rounded-full">
                                    <Flame size={9} className="text-small-orange" />
                                    <span className="text-[8px] font-black text-small-orange uppercase tracking-widest">Hot</span>
                                  </span>
                                )}
                              </div>
                              <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">{genreAlbums.length + vaultGenre.length + (audiusEnabled && audiusCuration ? (audiusCuration.genreCharts[genre]?.length ?? 0) : 0)} Items</span>
                            </div>
                            {(genreAlbums.length > 0 || vaultGenre.length > 0) ? (
                              <div className="flex gap-6 overflow-x-auto no-scrollbar pb-4 -mx-6 px-6">
                                {genreAlbums.map((album, idx) => (
                                  <div key={album.id} onClick={() => onSelectAlbum(album)} className="min-w-[150px] group cursor-pointer relative">
                                    <div className="aspect-square rounded-2xl overflow-hidden mb-3 border border-white/10 shadow-xl relative">
                                      <img src={thumb(album.coverImage, THUMB.card) || undefined} onError={onThumbError(album.coverImage)} className="w-full h-full object-cover group-hover:scale-110 transition-transform" loading="lazy" decoding="async" />
                                      {idx === 0 && (album.playCount || 0) > 0 && (
                                        <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 bg-small-orange text-black rounded-full">
                                          <Flame size={8} /><span className="text-[7px] font-black uppercase">#1</span>
                                        </div>
                                      )}
                                    </div>
                                    <h5 className="text-[10px] font-black uppercase tracking-widest truncate">{album.title}</h5>
                                    <p className="text-[9px] font-bold text-white/50 uppercase tracking-widest">{fmtPlays(album.playCount ?? 0)} plays</p>
                                  </div>
                                ))}
                                {vaultGenre.map(track => (
                                  <div key={track.id} className="min-w-[150px] group cursor-pointer" onClick={() => handlePlayVaultTrack(track)}>
                                    <div className="aspect-square rounded-2xl overflow-hidden mb-3 border border-white/10 shadow-xl opacity-60">
                                      <img src={thumb(track.thumbnailUrl, THUMB.small) || undefined} className="w-full h-full object-cover group-hover:scale-110 transition-transform" loading="lazy" decoding="async" />
                                    </div>
                                    <h5 className="text-[10px] font-black uppercase tracking-widest truncate">{track.title}</h5>
                                    <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest">Vault</p>
                                  </div>
                                ))}
                                {/* Audius genre chart tracks */}
                                {audiusEnabled && audiusCuration && (audiusCuration.genreCharts[genre] ?? []).map(track => (
                                  <div key={track.id} className="min-w-[150px] group cursor-pointer" onClick={() => handlePlayVaultTrack(track)}>
                                    <div className="aspect-square rounded-2xl overflow-hidden mb-3 shadow-xl relative" style={{ border: '1px solid rgba(168,85,247,0.3)' }}>
                                      <img src={thumb(track.thumbnailUrl, THUMB.small) || undefined} className="w-full h-full object-cover group-hover:scale-110 transition-transform" loading="lazy" decoding="async" />
                                      <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[6px] font-black" style={{ background: 'rgba(126,34,206,0.85)', color: '#e9d5ff' }}>AUDIUS</div>
                                    </div>
                                    <h5 className="text-[10px] font-black uppercase tracking-widest truncate">{track.title}</h5>
                                    <p className="text-[8px] font-bold uppercase tracking-widest" style={{ color: 'rgba(168,85,247,0.6)' }}>{track.artist}</p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="p-8 bg-white/[0.02] rounded-3xl border border-dashed border-white/10 flex flex-col items-center justify-center text-center">
                                <Sparkles className="text-white/10 mb-4" size={32} />
                                <p className="text-xs font-black uppercase tracking-widest text-white/20 mb-2">Be the first here in {genre}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {activeTab === 'AUDIO_BOOKS' && (
                  <section className="animate-in fade-in duration-500">
                    <div className="flex items-center justify-between mb-12">
                      <h1 style={{ fontSize: 'clamp(2.5rem, 12vw, 12rem)' }} className="break-words font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none mb-6 sm:mb-12">Audiobooks</h1>
                      <div className="p-2 px-4 bg-white/5 rounded-xl border border-white/10 text-[8px] font-black uppercase tracking-widest text-white/40">
                        Historical Archive
                      </div>
                    </div>
                    <AdaptiveGrid phone={2} tablet={3} desktop={5} gap="1.5rem">
                      {vaultTracks.filter(t => t.genre === 'Audiobook').map(track => (
                        <div key={track.id} className="group cursor-pointer" onClick={() => handlePlayVaultTrack(track)}>
                          <div className="aspect-[2/3] rounded-2xl overflow-hidden mb-4 shadow-2xl border border-white/5 relative">
                            <img src={thumb(track.thumbnailUrl, THUMB.small) || undefined} className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" decoding="async" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                              <PlayCircle size={48} className="text-small-orange" />
                            </div>
                          </div>
                          <h4 className="text-xs font-black uppercase tracking-widest truncate">{track.title}</h4>
                          <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">{track.artist}</p>
                        </div>
                      ))}
                    </AdaptiveGrid>
                  </section>
                )}

                {activeTab === 'MY_LIBRARY' && userProfile && <MyLibraryView profile={userProfile} />}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Playlist picker modal */}
      {playlistPickerTrack && (
        <PlaylistPickerModal
          track={playlistPickerTrack}
          onClose={() => setPlaylistPickerTrack(null)}
        />
      )}
      {album3D && (
        <Suspense fallback={null}>
          <AlbumArt3DViewer album={album3D} onClose={() => setAlbum3D(null)} />
        </Suspense>
      )}

      <AnimatePresence>
        {signInAction && (
          <SignInPrompt action={signInAction} onClose={() => setSignInAction(null)} />
        )}
      </AnimatePresence>
    </div>
  );
};
export default MusicView;
