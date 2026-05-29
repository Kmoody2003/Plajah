import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { Album, Track, UserProfile, Playlist } from '../types';
import PageHeader from './PageHeader';
const AlbumArt3DViewer = lazy(() => import('./AlbumArt3DViewer'));
import {
  Play, Pause, SkipForward, SkipBack, Heart, Share2,
  Radio, Music2, Mic2, Disc, Star, TrendingUp,
  ChevronLeft, ChevronRight, PlayCircle, User,
  ListMusic, Sparkles, Clock, Zap, BookOpen, Headphones, VideoIcon, LayoutGrid,
  Filter, ArrowUpDown, Archive, History, Library, Search,
  Headphones as HeadphonesIcon, BarChart2, Flame, Plus, X, Trash2, ChevronDown, ChevronUp, Layers, Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { fetchAllPublicAlbums, fetchUpcomingAlbums, fetchUserProfile, searchUsers, fetchSystemSettingsConfig, fetchPlaylistsByIds, syncPublicDomainAsset, fetchPersonalPlaylists, createPlaylist, deletePlaylist, addTrackToPlaylist, addExternalTrackToPlaylist, removeTrackFromPlaylist, fetchTrackStats, updateUserProfile, auth } from '../services/backendService';
import SignInPrompt from './SignInPrompt';
import PlaylistPickerModal from './PlaylistPickerModal';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';
import MyLibraryView from './MyLibraryView';
import FeaturedCarousel from './FeaturedCarousel';
import ThreeDImage from './ThreeDImage';
import { PodcastsView } from './PodcastsView';
import { fetchArchiveMusic, fetchWikimediaAudio, fetchJamendoMusic, fetchArchiveAudiobooks, fetchArchivePodcasts, ArchiveTrack } from '../services/archiveContentService';
import {
  fetchAudiusTrending, searchAudius,
  loadAudiusCuration, fetchAudiusPlaylistTracks, fetchAudiusArtistTracks,
  AudiusCuration, AudiusPlaylist, AudiusArtist,
} from '../services/audiusService';
import PlajahPlusBanner from './PlajahPlusBanner';

type TabType = 'NEW' | 'FOR_YOU' | 'ARTISTS' | 'ALBUMS' | 'GENRES' | 'VAULT' | 'PODCASTS' | 'AUDIO_BOOKS' | 'MY_LIBRARY' | 'PLAYLISTS';

interface MusicViewProps {
  onBack: () => void;
  onSelectAlbum: (album: Album) => void;
  onVisitUser: (uid: string, initialTab?: string) => void;
  userProfile: UserProfile | null;
  initialTab?: TabType;
  onUploadMusic?: () => void;
}

const MusicView: React.FC<MusicViewProps> = ({ onBack, onSelectAlbum, onVisitUser, userProfile, initialTab, onUploadMusic }) => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<UserProfile[]>([]);
  const [curatedPlaylists, setCuratedPlaylists] = useState<Playlist[]>([]);
  const [vaultTracks, setVaultTracks] = useState<ArchiveTrack[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>(initialTab ?? 'NEW');
  const [isLoading, setIsLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState<'RECENT' | 'ALPHA'>('RECENT');
  const [vaultSource, setVaultSource] = useState<'ALL' | 'INTERNET_ARCHIVE' | 'WIKIMEDIA' | 'JAMENDO' | 'AUDIUS'>('ALL');
  const [vaultCategory, setVaultCategory] = useState<'ALL' | 'JAZZ' | 'CLASSICAL' | 'AUDIOBOOKS' | 'PODCASTS' | 'TRENDING'>('ALL');
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

  useEffect(() => {
    const loadVault = async () => {
      try {
        let tracks: ArchiveTrack[] = [];
        if (vaultCategory === 'TRENDING') {
          tracks = await fetchAudiusTrending(undefined, 50);
        } else if (vaultCategory === 'JAZZ') {
          const [ia, audius] = await Promise.all([
            fetchArchiveMusic('Jazz', 30),
            fetchAudiusTrending('Jazz', 20),
          ]);
          tracks = [...ia, ...audius];
        } else if (vaultCategory === 'CLASSICAL') {
          const [ia, audius] = await Promise.all([
            fetchArchiveMusic('Classical', 30),
            fetchAudiusTrending('Classical', 20),
          ]);
          tracks = [...ia, ...audius];
        } else if (vaultCategory === 'AUDIOBOOKS') {
          tracks = await fetchArchiveAudiobooks(40);
        } else if (vaultCategory === 'PODCASTS') {
          tracks = await fetchArchivePodcasts(40);
        } else {
          // ALL — mix all sources including Audius
          const [ia, wiki, jam, audius] = await Promise.all([
            fetchArchiveMusic('All', 15),
            fetchWikimediaAudio('Classical', 10),
            fetchJamendoMusic(15),
            fetchAudiusTrending(undefined, 20),
          ]);
          tracks = [...ia, ...wiki, ...jam, ...audius];
        }
        setVaultTracks(tracks.sort(() => Math.random() - 0.5));
      } catch (err) {
        console.error("Vault load error:", err);
      }
    };
    if (activeTab === 'VAULT') loadVault();
  }, [activeTab, vaultCategory]);

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
      description: track.source === 'AUDIUS'
        ? `Streaming via Audius — the decentralized music network. Artist earns on every play.`
        : `Public domain recording from ${track.source}.`
    };
    playTrack(vaultTrack, vaultAlbum, 'RADIO');
  };

  const handlePlayAudiusPlaylist = async (playlist: AudiusPlaylist) => {
    const tracks = await fetchAudiusPlaylistTracks(playlist.id);
    if (!tracks.length) return;
    const albumTracks: Track[] = tracks.map(t => ({
      id: t.id, title: t.title, artist: t.artist,
      url: t.url, albumCover: t.thumbnailUrl, images: [t.thumbnailUrl],
      genre: t.genre, isGlobalArchive: true,
    }));
    const album: Album = {
      id: `audius_pl_${playlist.id}`, title: playlist.title,
      artist: playlist.curator, coverImage: playlist.artworkUrl,
      tracks: albumTracks, createdAt: Date.now(), themeColor: '#7e22ce',
      description: playlist.description ?? `Audius playlist by ${playlist.curator}`,
    };
    playTrack(albumTracks[0], album, 'RADIO');
  };

  const handlePlayAudiusArtist = async (artist: AudiusArtist) => {
    const tracks = await fetchAudiusArtistTracks(artist.id, 15);
    if (!tracks.length) { window.open(`https://audius.co/${artist.handle}`, '_blank'); return; }
    tracks.forEach(t => handlePlayVaultTrack(t));
    handlePlayVaultTrack(tracks[0]);
  };

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
        t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
      );
    }

    const sourceBadge = (track: ArchiveTrack) => {
      const isAudius = track.source === 'AUDIUS';
      return (
        <div
          className="absolute top-2 right-2 px-2 py-1 backdrop-blur-md rounded-lg text-[7px] font-black uppercase tracking-widest"
          style={isAudius
            ? { background: 'rgba(126,34,206,0.85)', color: '#e9d5ff' }
            : { background: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.8)' }}
        >
          {isAudius ? 'AUDIUS' : track.source.split('_')[0]}
        </div>
      );
    };

    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="shrink-0">
            <PageHeader wrapperClassName="mb-12">Plajah Vault</PageHeader>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-2 px-1">
              Public Domain · Creative Commons · Audius Decentralized
            </p>
          </div>

          <div className="flex-1 max-w-sm">
            <div className="flex items-center gap-4 px-6 py-3 bg-white/5 border border-white/10 rounded-2xl">
              <Search size={16} className="text-white/20" />
              <input
                type="text"
                placeholder={vaultSource === 'AUDIUS' ? 'Search Audius…' : 'Search Archive Artists & Tracks…'}
                value={vaultSearchQuery}
                onChange={e => setVaultSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none text-xs font-bold w-full placeholder:text-white/10"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {/* Category chips */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              {(['ALL', 'TRENDING', 'JAZZ', 'CLASSICAL', 'AUDIOBOOKS', 'PODCASTS'] as const).map(cat => (
                <button
                  key={cat}
                  onClick={() => { setVaultCategory(cat); if (cat === 'TRENDING') setVaultSource('ALL'); }}
                  className="px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all"
                  style={vaultCategory === cat
                    ? cat === 'TRENDING'
                      ? { background: '#7e22ce', borderColor: '#7e22ce', color: '#e9d5ff' }
                      : { background: 'var(--color-small-orange, #ff8c00)', borderColor: 'var(--color-small-orange, #ff8c00)', color: '#000' }
                    : { background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}
                >
                  {cat === 'TRENDING' ? '⚡ Trending' : cat}
                </button>
              ))}
            </div>
            {/* Source chips */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              {(['ALL', 'AUDIUS', 'INTERNET_ARCHIVE', 'WIKIMEDIA', 'JAMENDO'] as const).map(source => (
                <button
                  key={source}
                  onClick={() => setVaultSource(source)}
                  className="px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border transition-all"
                  style={vaultSource === source
                    ? source === 'AUDIUS'
                      ? { background: '#7e22ce', borderColor: '#7e22ce', color: '#e9d5ff' }
                      : { background: '#fff', borderColor: '#fff', color: '#000' }
                    : { background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}
                >
                  {source === 'AUDIUS' ? '◈ Audius' : source.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Audius hero strip when TRENDING or AUDIUS source selected */}
        {(vaultCategory === 'TRENDING' || vaultSource === 'AUDIUS') && (
          <div className="flex items-center gap-4 px-6 py-4 rounded-2xl"
            style={{ background: 'linear-gradient(135deg,rgba(126,34,206,0.25),rgba(168,85,247,0.1))', border: '1px solid rgba(168,85,247,0.25)' }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: '#7e22ce' }}>
              <Music2 size={14} className="text-purple-200" />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-purple-400 mb-0.5">Audius — Decentralized Music</p>
              <p className="text-[10px] text-white/50 leading-tight truncate">
                {vaultCategory === 'TRENDING' ? 'Top trending tracks on the Audius blockchain network · streams pay artists directly' : 'Streaming live from the Audius decentralized network · zero middlemen'}
              </p>
            </div>
            <a href="https://audius.co" target="_blank" rel="noopener noreferrer"
              className="shrink-0 px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest"
              style={{ background: '#7e22ce', color: '#e9d5ff' }}>
              Open Audius
            </a>
          </div>
        )}

        {/* Track grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {filteredVault.map(track => (
            <motion.div
              key={track.id}
              whileHover={{ y: -5 }}
              className="group bg-white/[0.03] border border-white/5 rounded-3xl p-4 transition-all hover:bg-white/[0.08]"
              style={track.source === 'AUDIUS' ? { borderColor: 'rgba(168,85,247,0.15)' } : undefined}
            >
              <div className="aspect-square rounded-2xl overflow-hidden mb-4 relative cursor-pointer" onClick={() => handlePlayVaultTrack(track)}>
                <img src={track.thumbnailUrl || undefined} className="w-full h-full object-cover transition-transform group-hover:scale-110" loading="lazy" decoding="async" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-black"
                    style={{ background: track.source === 'AUDIUS' ? '#a855f7' : 'var(--color-small-orange,#ff8c00)' }}>
                    <Play size={24} fill="currentColor" className="ml-1" />
                  </div>
                </div>
                {sourceBadge(track)}
              </div>
              <h4 className="text-xs font-black uppercase tracking-widest truncate mb-1">{track.title}</h4>
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
                    className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: 'rgba(255,255,255,0.08)' }}
                  >
                    <Plus size={10} className="text-white/60" />
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
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
              className="w-80 rounded-3xl p-6 space-y-4"
              style={{ background: '#0d0d14', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <div className="flex items-center gap-3 mb-2">
                {externalTrackPicker.thumbnailUrl && <img src={externalTrackPicker.thumbnailUrl} className="w-10 h-10 rounded-xl object-cover shrink-0" />}
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
                      ? <img src={pl.coverImage ?? pl.coverUrl} className="w-8 h-8 rounded-lg object-cover shrink-0" />
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
        className="space-y-12"
      >
        <button 
          onClick={() => setSelectedArchiveArtist(null)}
          className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors"
        >
          <ChevronLeft size={14} /> Back to Vault
        </button>

        <div className="flex flex-col md:flex-row gap-12 items-center md:items-end p-12 bg-white/[0.03] rounded-[3rem] border border-white/5">
          <div className="w-64 h-64 rounded-[3rem] overflow-hidden border-4 border-white/10 shadow-3xl shrink-0 bg-black">
            <img src={artistTracks[0]?.thumbnailUrl || undefined} className="w-full h-full object-cover opacity-50" loading="lazy" decoding="async" />
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
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
            {artistTracks.map(track => (
              <div key={track.id} className="group cursor-pointer" onClick={() => handlePlayVaultTrack(track)}>
                <div className="aspect-square rounded-2xl overflow-hidden mb-3 border border-white/5 bg-black">
                  <img src={track.thumbnailUrl || undefined} className="w-full h-full object-cover group-hover:scale-110 transition-transform" loading="lazy" decoding="async" />
                </div>
                <h4 className="text-[10px] font-black uppercase tracking-widest truncate">{track.title}</h4>
                <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest">Public Domain</p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="flex-1 bg-transparent text-white overflow-y-auto custom-scrollbar pb-40 relative">
      {bgAlbums.length > 0 && (
        <div className="fixed top-0 left-0 w-screen h-[80vh] pointer-events-none" style={{ zIndex: 0, WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 45%, transparent 100%)', maskImage: 'linear-gradient(to bottom, black 0%, black 45%, transparent 100%)' }}>
          <AnimatePresence mode="sync">
            <motion.img
              key={bgAlbums[bgIndex]?.id}
              src={bgAlbums[bgIndex]?.coverImage}
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
          <div className="px-6 lg:px-12 pt-8 mb-6 relative z-10" style={{ opacity: 0.82 }}>
            <PageHeader>Plajah Chora</PageHeader>
            <div className="mt-4">
              <PlajahPlusBanner variant="COMPACT" />
            </div>
          </div>
          <nav className={`px-6 lg:px-12 mb-12 sticky top-0 backdrop-blur-2xl bg-black/40 border-b border-white/20 shadow-[0_4px_30px_rgba(0,0,0,0.5)] z-40 py-4 ${s.nav} transition-all duration-500`}>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-8 overflow-x-auto no-scrollbar flex-1">
                {(['NEW', 'FOR_YOU', 'ARTISTS', 'ALBUMS', 'GENRES', 'VAULT', 'PODCASTS', 'AUDIO_BOOKS', 'MY_LIBRARY', 'PLAYLISTS'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => { setActiveTab(tab); setSelectedArchiveArtist(null); }}
                    className={`text-xs font-black uppercase tracking-[0.3em] whitespace-nowrap transition-all pb-2 border-b-2 ${activeTab === tab ? 'text-small-orange border-small-orange' : s.tabInactive}`}
                  >
                    {tab === 'VAULT' ? 'The Vault' : tab.replace('_', ' ')}
                  </button>
                ))}
              </div>
              {/* Audius toggle */}
              <button
                onClick={toggleAudiusEnabled}
                className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap"
                style={audiusEnabled
                  ? { background: '#7e22ce', color: '#e9d5ff', boxShadow: '0 0 20px rgba(126,34,206,0.5)' }
                  : { background: 'rgba(126,34,206,0.15)', color: 'rgba(168,85,247,0.8)', border: '1px solid rgba(168,85,247,0.3)' }}
              >
                <Music2 size={13} />
                {audiusLoading ? 'Loading…' : 'Audius'}
              </button>

              {onUploadMusic && (
                <button
                  onClick={onUploadMusic}
                  className="shrink-0 flex items-center gap-2 px-5 py-2.5 bg-small-orange text-black rounded-full text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,140,0,0.4)] whitespace-nowrap"
                >
                  <Upload size={13} />
                  Upload Music
                </button>
              )}
            </div>
          </nav>
          {activeTab === 'NEW' && !selectedArchiveArtist && (
            <div className="px-6 lg:px-12 pt-8 mb-6">
              <h1 className="text-5xl sm:text-7xl md:text-9xl lg:text-[12rem] break-words font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none mb-12">New</h1>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
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
                            <img src={album.coverImage} className="w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-700" loading="lazy" />
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
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
                    {albums.slice(0, 8).map((album) => (
                      <div key={album.id} onClick={() => onSelectAlbum(album)} className="group cursor-pointer">
                        <div className="aspect-square rounded-[2rem] overflow-hidden mb-3 border border-white/5 shadow-2xl relative">
                          <ThreeDImage src={album.coverImage} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
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
                  </div>
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
                    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-4">
                      {audiusCuration.trending.slice(0, 10).map(track => (
                        <motion.div key={track.id} whileHover={{ y: -4 }}
                          className="group cursor-pointer rounded-2xl p-3 transition-all"
                          style={{ background: 'rgba(126,34,206,0.08)', border: '1px solid rgba(168,85,247,0.15)' }}
                          onClick={() => handlePlayVaultTrack(track)}>
                          <div className="aspect-square rounded-xl overflow-hidden mb-3 relative">
                            <img src={track.thumbnailUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform" loading="lazy" />
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
                              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#7e22ce' }}><Play size={14} fill="currentColor" className="text-purple-100 ml-0.5" /></div>
                            </div>
                            <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[6px] font-black" style={{ background: 'rgba(126,34,206,0.85)', color: '#e9d5ff' }}>AUDIUS</div>
                          </div>
                          <div className="flex items-center justify-between gap-1 mt-0.5">
                            <p className="text-[8px] truncate" style={{ color: 'rgba(168,85,247,0.7)' }}>{track.artist}</p>
                            {personalPlaylists.length > 0 && (
                              <button onClick={e => { e.stopPropagation(); setExternalTrackPicker(track); }}
                                className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{ background: 'rgba(126,34,206,0.3)' }}>
                                <Plus size={9} style={{ color: '#c084fc' }} />
                              </button>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </section>
                )}

                {/* ── Audius Playlists ── */}
                {audiusEnabled && audiusCuration && audiusCuration.playlists.length > 0 && (
                  <section className="animate-in fade-in duration-500">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: '#7e22ce' }}><ListMusic size={10} className="text-purple-200" /></div>
                      <h2 className="text-[10px] font-black uppercase tracking-[0.4em]" style={{ color: '#a855f7' }}>Audius Featured Playlists</h2>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
                      {audiusCuration.playlists.map(pl => (
                        <motion.div key={pl.id} whileHover={{ y: -4 }}
                          className="group cursor-pointer rounded-2xl p-3 transition-all"
                          style={{ background: 'rgba(126,34,206,0.08)', border: '1px solid rgba(168,85,247,0.15)' }}
                          onClick={() => handlePlayAudiusPlaylist(pl)}>
                          <div className="aspect-square rounded-xl overflow-hidden mb-3 relative">
                            {pl.artworkUrl ? <img src={pl.artworkUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform" loading="lazy" /> : <div className="w-full h-full flex items-center justify-center" style={{ background: 'rgba(126,34,206,0.3)' }}><ListMusic size={24} style={{ color: '#a855f7' }} /></div>}
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
                              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#7e22ce' }}><Play size={14} fill="currentColor" className="text-purple-100 ml-0.5" /></div>
                            </div>
                          </div>
                          <p className="text-[9px] font-black uppercase tracking-widest truncate">{pl.title}</p>
                          <p className="text-[8px] truncate mt-0.5" style={{ color: 'rgba(168,85,247,0.7)' }}>by {pl.curator} · {pl.trackCount} tracks</p>
                        </motion.div>
                      ))}
                    </div>
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
                          <img src={track.thumbnailUrl} className="w-10 h-10 rounded-lg object-cover shrink-0" loading="lazy" />
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
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
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
                                  <img src={pl.coverImage || undefined} className="w-full h-full object-cover rounded-xl pointer-events-none" loading="lazy" decoding="async" />
                              ) : (
                                  <ListMusic size={32} className="text-white/10 group-hover:text-small-orange transition-colors" />
                              )}
                           </div>
                           <h4 className="text-xs font-black uppercase tracking-widest truncate mb-1">{pl.title}</h4>
                           <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest truncate">by {pl.authorName}</p>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </div>

              <div className="space-y-8 flex flex-col">

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
                            src={upcomingAlbums[pulseIdx].coverImage}
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
                          src={upcomingAlbums[sponsoredIdx].coverImage}
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
                        <img src={artist.photoURL || `https://picsum.photos/seed/${artist.uid}/200/200`} className="w-12 h-12 rounded-full object-cover group-hover:ring-2 ring-small-orange/50 transition-all" loading="lazy" decoding="async" />
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
                        <img src={artist.photoURL || undefined} className="w-10 h-10 rounded-full object-cover" loading="lazy" decoding="async" />
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
                         <img src={track.images?.[0] || track.albumCover || undefined} className="w-10 h-10 rounded-xl object-cover cursor-pointer" onClick={() => playTrack(track, albums.find(a => a.tracks?.some(t => t.id === track.id)) || null, 'LIBRARY')} />
                         <div className="flex-1 truncate cursor-pointer" onClick={() => playTrack(track, albums.find(a => a.tracks?.some(t => t.id === track.id)) || null, 'LIBRARY')}>
                           <h5 className="text-[10px] font-black uppercase tracking-widest truncate group-hover:text-small-orange transition-colors">{track.title}</h5>
                           <div className="flex items-center gap-2">
                             <span className="text-[8px] font-bold text-white/40 uppercase tracking-widest truncate">{track.artist}</span>
                             <span className="text-[9px] font-bold text-white/40 shrink-0">{fmtPlays(trackStats[track.id] ?? 0)} plays</span>
                           </div>
                         </div>
                         <button
                           onClick={e => { e.stopPropagation(); if (!auth.currentUser) { setSignInAction('save to playlists'); } else { setPlaylistPickerTrack(track); } }}
                           className="p-1.5 rounded-full bg-white/5 opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all shrink-0"
                           title="Add to playlist"
                         >
                           <Plus size={10} />
                         </button>
                       </div>
                    ))}
                  </div>
                </div>
              </div>
              </div>
            </div>
          )}

          {activeTab === 'FOR_YOU' && !selectedArchiveArtist && userProfile && (
             <div className="px-6 lg:px-12 pt-8 mb-6 space-y-12 animate-in fade-in">
               <h1 className="text-5xl sm:text-7xl md:text-9xl lg:text-[12rem] break-words font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none mb-12">For You</h1>

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
                           <img src={album.coverImage} className="w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-700" loading="lazy" />
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
                 <div className="grid grid-cols-2 lg:grid-cols-5 gap-6">
                   {albums.filter(a => userProfile.following?.includes(a.ownerId || '')).map((album) => (
                     <div key={album.id} onClick={() => onSelectAlbum(album)} className="group cursor-pointer">
                        <div className="aspect-square rounded-[2rem] overflow-hidden mb-3 border border-white/5 shadow-xl relative">
                          <ThreeDImage src={album.coverImage} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                        </div>
                        <h4 className="text-[10px] font-black uppercase tracking-widest truncate">{album.title}</h4>
                        <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest truncate">{album.artist}</p>
                     </div>
                   ))}
                 </div>
               </section>

               <section>
                 <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 mb-6">Suggested Creators</h2>
                 <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4 mask-fade-edges">
                    {artists.filter(a => !userProfile.following?.includes(a.uid)).slice(0, 10).map(artist => (
                      <div key={artist.uid} onClick={() => onVisitUser(artist.uid, 'CONTENT')} className="min-w-[140px] text-center group cursor-pointer flex-shrink-0">
                         <div className="aspect-square rounded-full overflow-hidden mb-4 border-2 border-white/5 p-1 relative">
                            <img src={artist.photoURL || undefined} className="w-full h-full object-cover rounded-full group-hover:scale-110 transition-transform" loading="lazy" decoding="async" />
                         </div>
                         <h4 className="text-[10px] font-black uppercase tracking-widest truncate">{artist.displayName}</h4>
                         <span className="text-[8px] font-bold text-small-orange uppercase tracking-widest bg-small-orange/10 px-2 py-1 rounded-full mt-2 inline-block">Recommended</span>
                      </div>
                    ))}
                 </div>
               </section>
             </div>
          )}

          <div className="px-6 lg:px-12 space-y-16">
            {selectedArchiveArtist ? renderArchiveArtistInfo() : (
              <>
                {activeTab === 'PODCASTS' && <PodcastsView />}
                {activeTab === 'VAULT' && renderVault()}
                
                {activeTab === 'PLAYLISTS' && (
                  <section className="animate-in fade-in duration-500 space-y-16">
                    <h1 className="text-5xl sm:text-7xl md:text-9xl lg:text-[12rem] break-words font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Playlists</h1>

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
                                    ? <img src={(pl.coverUrl || pl.coverImage) ?? undefined} className="w-full h-full object-cover" loading="lazy" decoding="async" />
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
                                          <img src={track.images?.[0] || track.albumCover || undefined} className="w-10 h-10 rounded-xl object-cover border border-white/5 shrink-0" loading="lazy" decoding="async" />
                                          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => playTrack(track, { id: pl.id, ownerId: pl.ownerId, title: pl.title, artist: 'My Playlist', coverImage: pl.coverUrl || pl.coverImage || '', tracks: pl.tracks || [], type: 'MUSIC', createdAt: pl.timestamp } as any, 'LIBRARY')}>
                                            <h5 className="text-xs font-black uppercase tracking-widest truncate group-hover:text-small-orange transition-colors">{track.title}</h5>
                                            <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest truncate">{track.artist}</p>
                                          </div>
                                          <span className="text-[9px] font-bold text-white/40 shrink-0">{fmtPlays(trackStats[track.id] ?? 0)} plays</span>
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
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8">
                          {curatedPlaylists.map(pl => (
                            <div
                              key={pl.id}
                              onClick={() => onSelectAlbum({ id: pl.id, ownerId: pl.ownerId, title: pl.title, artist: pl.authorName || 'Curator', coverImage: pl.coverImage || '', tracks: pl.tracks || [], type: 'MUSIC', subType: 'PLAYLIST', createdAt: pl.timestamp, isPublic: true } as any)}
                              className="group cursor-pointer p-4 bg-white/[0.03] border border-white/5 rounded-3xl hover:bg-white/[0.08] transition-all text-center"
                            >
                              <div className="aspect-square rounded-2xl overflow-hidden mb-4 bg-black/40 flex items-center justify-center group-hover:scale-[1.02] transition-transform">
                                {pl.coverImage
                                  ? <img src={pl.coverImage ?? undefined} className="w-full h-full object-cover rounded-xl" loading="lazy" decoding="async" />
                                  : <ListMusic size={48} className="text-white/10 group-hover:text-small-orange transition-colors" />
                                }
                              </div>
                              <h4 className="text-sm font-black uppercase tracking-widest truncate mb-2">{pl.title}</h4>
                              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest truncate">by {pl.authorName}</p>
                              <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest mt-2">{pl.tracks?.length || 0} Tracks</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </section>
                )}

                {activeTab === 'ARTISTS' && (
                  <section className="animate-in fade-in duration-500 space-y-16">
                    <div className="flex items-center justify-between">
                      <h1 className="text-5xl sm:text-7xl md:text-9xl lg:text-[12rem] break-words font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Artists</h1>
                      <button onClick={() => setSortOrder(sortOrder === 'RECENT' ? 'ALPHA' : 'RECENT')} className="p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition-all flex items-center gap-2">
                        <ArrowUpDown size={16} />
                        <span className="text-[9px] font-black uppercase tracking-widest">{sortOrder === 'RECENT' ? 'Recently Joined' : 'Alphabetical'}</span>
                      </button>
                    </div>

                    {/* Trending Artists chart */}
                    <div>
                      <div className="flex items-center gap-3 mb-6">
                        <Flame size={16} className="text-small-orange" />
                        <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/60">Trending Artists</h2>
                      </div>
                      <div className="space-y-2">
                        {[...artists].sort((a, b) => (b.followerCount || 0) - (a.followerCount || 0)).slice(0, 10).map((artist, idx) => (
                          <div key={artist.uid} onClick={() => onVisitUser(artist.uid, 'CONTENT')} className="flex items-center gap-5 p-4 rounded-2xl hover:bg-white/[0.04] transition-colors group cursor-pointer">
                            <span className="text-2xl font-black text-white/10 w-8 text-center shrink-0">#{idx + 1}</span>
                            <img src={artist.photoURL || undefined} className="w-12 h-12 rounded-full object-cover border border-white/10 shrink-0" loading="lazy" decoding="async" />
                            <div className="flex-1 min-w-0">
                              <h4 className="text-xs font-black uppercase tracking-widest truncate group-hover:text-small-orange transition-colors">{artist.displayName}</h4>
                              <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest">{(artist.followerCount || 0).toLocaleString()} Fans</p>
                            </div>
                            {idx === 0 && <span className="px-3 py-1 bg-small-orange/20 text-small-orange text-[8px] font-black uppercase tracking-widest rounded-full">Top</span>}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Full grid */}
                    <div>
                      <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 mb-6">All Artists</h2>
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-8">
                        {getSortedArtists().map(artist => (
                          <div key={artist.uid} onClick={() => onVisitUser(artist.uid, 'CONTENT')} className="group cursor-pointer text-center">
                            <div className="aspect-square rounded-[2rem] overflow-hidden mb-4 border border-white/5 relative">
                              <img src={artist.photoURL || undefined} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" loading="lazy" decoding="async" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <User size={32} className="text-white" />
                              </div>
                            </div>
                            <h4 className="text-xs font-black uppercase tracking-widest truncate">{artist.displayName}</h4>
                            <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">{artist.followerCount} Fans</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* ── Audius Artists ── */}
                    {audiusEnabled && audiusCuration && audiusCuration.artists.length > 0 && (
                      <div>
                        <div className="flex items-center gap-3 mb-6 mt-4 pt-8 border-t border-purple-900/30">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: '#7e22ce' }}><User size={10} className="text-purple-200" /></div>
                          <h2 className="text-[10px] font-black uppercase tracking-[0.4em]" style={{ color: '#a855f7' }}>Audius Featured Artists</h2>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-8">
                          {audiusCuration.artists.map(artist => (
                            <div key={artist.id}
                              onClick={() => handlePlayAudiusArtist(artist)}
                              className="group cursor-pointer text-center">
                              <div className="aspect-square rounded-[2rem] overflow-hidden mb-4 relative"
                                style={{ border: '1px solid rgba(168,85,247,0.2)' }}>
                                {artist.profilePicture
                                  ? <img src={artist.profilePicture} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" loading="lazy" />
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
                        </div>
                      </div>
                    )}
                  </section>
                )}

                {activeTab === 'ALBUMS' && (
                  <section className="animate-in fade-in duration-500 space-y-16">
                    <div className="flex items-center justify-between">
                      <h1 className="text-5xl sm:text-7xl md:text-9xl lg:text-[12rem] break-words font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Albums</h1>
                      <button onClick={() => setSortOrder(sortOrder === 'RECENT' ? 'ALPHA' : 'RECENT')} className="p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition-all flex items-center gap-2">
                        <ArrowUpDown size={16} />
                        <span className="text-[9px] font-black uppercase tracking-widest">{sortOrder === 'RECENT' ? 'Newest First' : 'Alphabetical'}</span>
                      </button>
                    </div>

                    {/* ── Coming Soon ── */}
                    {upcomingAlbums.length > 0 && (
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
                                <img src={album.coverImage} className="w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-700" loading="lazy" />
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
                    {trendingAlbums.length > 0 && (
                      <div>
                        <div className="flex items-center gap-3 mb-6">
                          <BarChart2 size={16} className="text-small-orange" />
                          <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/60">Top Charts</h2>
                        </div>
                        <div className="space-y-2">
                          {trendingAlbums.map((album, idx) => (
                            <div key={album.id} onClick={() => onSelectAlbum(album)} className="flex items-center gap-5 p-4 rounded-2xl hover:bg-white/[0.04] transition-colors group cursor-pointer">
                              <span className={`text-2xl font-black w-8 text-center shrink-0 ${idx < 3 ? 'text-small-orange' : 'text-white/10'}`}>#{idx + 1}</span>
                              <img src={album.coverImage || undefined} className="w-12 h-12 rounded-xl object-cover border border-white/10 shrink-0" loading="lazy" decoding="async" />
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
                      <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 mb-6">All Albums</h2>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8">
                        {getSortedAlbums().map(album => (
                          <div key={album.id} onClick={() => onSelectAlbum(album)} className="group cursor-pointer">
                            <div className="aspect-square rounded-3xl overflow-hidden mb-4 shadow-2xl border border-white/5 relative">
                              <ThreeDImage src={album.coverImage} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                              <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-1 bg-black/70 backdrop-blur-sm rounded-lg">
                                <HeadphonesIcon size={9} className="text-white/70" />
                                <span className="text-[9px] font-black text-white/70">{fmtPlays(album.playCount ?? 0)}</span>
                              </div>
                            </div>
                            <h4 className="text-xs font-black uppercase tracking-widest truncate">{album.title}</h4>
                            <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">{album.artist}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* ── Audius Playlists in ALBUMS tab ── */}
                    {audiusEnabled && audiusCuration && audiusCuration.playlists.length > 0 && (
                      <div>
                        <div className="flex items-center gap-3 mb-6 pt-8 border-t border-purple-900/30">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: '#7e22ce' }}><ListMusic size={10} className="text-purple-200" /></div>
                          <h2 className="text-[10px] font-black uppercase tracking-[0.4em]" style={{ color: '#a855f7' }}>Audius Playlists</h2>
                          <span className="text-[8px] font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(126,34,206,0.2)', color: '#c084fc' }}>Decentralized</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8">
                          {audiusCuration.playlists.map(pl => (
                            <motion.div key={pl.id} whileHover={{ scale: 1.02 }}
                              onClick={() => handlePlayAudiusPlaylist(pl)}
                              className="group cursor-pointer">
                              <div className="aspect-square rounded-3xl overflow-hidden mb-4 shadow-2xl relative"
                                style={{ border: '1px solid rgba(168,85,247,0.2)' }}>
                                {pl.artworkUrl
                                  ? <img src={pl.artworkUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
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
                        </div>
                      </div>
                    )}
                  </section>
                )}

                {activeTab === 'GENRES' && (
                  <section className="animate-in fade-in duration-500">
                    <h1 className="text-5xl sm:text-7xl md:text-9xl lg:text-[12rem] break-words font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none mb-12">Genres</h1>
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
                                      <img src={album.coverImage || undefined} className="w-full h-full object-cover group-hover:scale-110 transition-transform" loading="lazy" decoding="async" />
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
                                      <img src={track.thumbnailUrl || undefined} className="w-full h-full object-cover group-hover:scale-110 transition-transform" loading="lazy" decoding="async" />
                                    </div>
                                    <h5 className="text-[10px] font-black uppercase tracking-widest truncate">{track.title}</h5>
                                    <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest">Vault</p>
                                  </div>
                                ))}
                                {/* Audius genre chart tracks */}
                                {audiusEnabled && audiusCuration && (audiusCuration.genreCharts[genre] ?? []).map(track => (
                                  <div key={track.id} className="min-w-[150px] group cursor-pointer" onClick={() => handlePlayVaultTrack(track)}>
                                    <div className="aspect-square rounded-2xl overflow-hidden mb-3 shadow-xl relative" style={{ border: '1px solid rgba(168,85,247,0.3)' }}>
                                      <img src={track.thumbnailUrl || undefined} className="w-full h-full object-cover group-hover:scale-110 transition-transform" loading="lazy" decoding="async" />
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
                      <h1 className="text-5xl sm:text-7xl md:text-9xl lg:text-[12rem] break-words font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none mb-12">Audiobooks</h1>
                      <div className="p-2 px-4 bg-white/5 rounded-xl border border-white/10 text-[8px] font-black uppercase tracking-widest text-white/40">
                        Historical Archive
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8">
                      {vaultTracks.filter(t => t.genre === 'Audiobook').map(track => (
                        <div key={track.id} className="group cursor-pointer" onClick={() => handlePlayVaultTrack(track)}>
                          <div className="aspect-[2/3] rounded-2xl overflow-hidden mb-4 shadow-2xl border border-white/5 relative">
                            <img src={track.thumbnailUrl || undefined} className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" decoding="async" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                              <PlayCircle size={48} className="text-small-orange" />
                            </div>
                          </div>
                          <h4 className="text-xs font-black uppercase tracking-widest truncate">{track.title}</h4>
                          <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">{track.artist}</p>
                        </div>
                      ))}
                    </div>
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
