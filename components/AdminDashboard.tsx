import React, { useState, useEffect, useRef } from 'react';
import { useUpload } from '../contexts/UploadContext';
import AlbumCreator from './AlbumCreator';
import CuratedBuilder from './CuratedBuilder';
import {
  Shield,
  Users,
  HardDrive,
  Activity,
  BarChart3,
  FolderTree,
  Megaphone,
  Bell,
  Settings,
  Search,
  ChevronRight,
  FileAudio,
  FileVideo,
  Image as ImageIcon,
  MoreVertical,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Plus,
  ExternalLink,
  ArrowLeft,
  Lock,
  Eye,
  Database,
  Palette,
  Loader2,
  Maximize2,
  Notebook,
  Zap,
  Sparkles,
  RefreshCw,
  X,
  Calendar,
  Check,
  LibraryBig,
  BookOpen,
  Music,
  Video as VideoIcon,
  CloudDownload,
  Clock,
  History,
  ShieldCheck,
  Monitor,
  Globe,
  Radio,
  Trophy,
  Star,
  Edit2,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
  UploadCloud,
  Tv,
  Hash,
} from 'lucide-react';

/**
 * A release in `albums` may be a record, a film, a TV series, a book, a photo set or a game —
 * `type` + `subType` are what say which. These three helpers exist because the admin lists
 * used to assume "album = music", which is how a feature film showed up as a music album.
 */
const albumKindLabel = (a: any): string => {
  const sub = String(a?.subType || '').toUpperCase();
  if (sub === 'MOVIE') return 'Film';
  if (sub === 'TV_SERIES') return 'TV Series';
  if (sub === 'PODCAST') return 'Podcast';
  if (sub === 'GRAPHIC_NOVEL') return 'Graphic Novel';
  if (sub === 'NOVEL') return 'Book';
  if (sub === 'MIX') return 'DJ Mix';
  if (sub === 'PLAYLIST') return 'Playlist';
  switch (String(a?.type || 'MUSIC').toUpperCase()) {
    case 'VIDEO': return 'Video';
    case 'BOOK': return 'Book';
    case 'PHOTO': return 'Photo Set';
    case 'GAME': return 'Game';
    default: return 'Album';
  }
};

/** Count the thing this release actually contains, named correctly. */
const albumItemCount = (a: any): string => {
  const sub = String(a?.subType || '').toUpperCase();
  if (sub === 'TV_SERIES') {
    const eps = (a?.seasons || []).reduce((n: number, s: any) => n + (s?.episodes?.length || 0), 0);
    return `${eps} Episode${eps === 1 ? '' : 's'}`;
  }
  const n = (a?.tracks || []).length;
  const t = String(a?.type || 'MUSIC').toUpperCase();
  if (sub === 'MOVIE') return n === 0 ? 'No film file' : `${n} Cut${n === 1 ? '' : 's'}`;
  if (t === 'BOOK') return `${(a?.bookChapters || []).length} Chapters`;
  if (t === 'PHOTO') return `${(a?.slideshow || []).length} Photos`;
  return `${n} Track${n === 1 ? '' : 's'}`;
};

/**
 * A published release with no playable media behind it. This is the "Pumpkin Patch" state:
 * cover art, synopsis, cast and crew all present, and no film. Flagged here so it is
 * visible in the admin list instead of only surfacing when a viewer presses play.
 */
const isMissingMedia = (a: any): boolean => {
  const t = String(a?.type || '').toUpperCase();
  const sub = String(a?.subType || '').toUpperCase();
  if (t !== 'VIDEO' || (sub !== 'MOVIE' && sub !== 'TV_SERIES')) return false;
  const playable = (x: any) => !!(x?.url || x?.muxUploadId || x?.muxPlaybackId);
  if ((a?.tracks || []).some(playable)) return false;
  if ((a?.seasons || []).some((s: any) => (s?.episodes || []).some(playable))) return false;
  if ((a?.alternateVersions || []).some(playable)) return false;
  return !a?.customVideoUrl;
};

import ErrorReportsPanel from './admin/ErrorReportsPanel';
import UploadReportsPanel from './admin/UploadReportsPanel';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile, SystemStats, AdConfig, Track, Album, Video, Photo, PostThemeBackground, InteractiveZone, SystemSettingsConfig, Universe, Playlist, VideoPlaylist } from '../types';
import { 
  fetchAllUsers, 
  fetchSystemStats, 
  fetchAdConfigs, 
  updateAdConfig, 
  deleteAdConfig,
  fetchUserAssets,
  fetchThemeBackgrounds,
  saveThemeBackground,
  deleteThemeBackground,
  fetchGlobalArchiveItems,
  saveGlobalArchiveItem,
  deleteGlobalArchiveItem,
  syncLibraryOfCongressBooks,
  fetchLibrarySyncConfig,
  updateLibrarySyncConfig,
  resyncBookItem,
  toggleGlobalArchiveVisibility,
  fetchSystemSettingsConfig,
  updateSystemSettingsConfig,
  fetchUniverses,
  saveUniverse,
  deleteUniverse,
  fetchAllPublicPlaylists,
  fetchAllPublicVideoPlaylists,
  fetchAllVideos,
  migratePostsToFeed,
  propagateDisplayName,
  serverResyncDisplayName
} from '../services/backendService';
import { analyzeThemeBackground } from '../services/geminiService';
import { getFlag, updateFlag } from '../services/featureFlagService';
import { fetchAllAchievements, createAchievement, updateAchievement, deactivateAchievement } from '../services/achievementService';
import { Achievement } from '../types';
import FileUploader from './FileUploader';
import { ThemePresetManager } from './ThemePresetManager';
import { AdminLiveFeedsManager } from './AdminLiveFeedsManager';
import ChannelNumberMigration from './admin/ChannelNumberMigration';
import AdminEndlessHour from './admin/AdminEndlessHour';
import AdminLandingBgManager from './AdminLandingBgManager';
import AdminPlatformMediaLibrary from './admin/AdminPlatformMediaLibrary';
import AdminClubCoverMediaManager from './AdminClubCoverMediaManager';
import AdminSportsHeroManager from './AdminSportsHeroManager';
import AdminSiteHealth from './AdminSiteHealth';
import AdminAnalyticsDashboard from './AdminAnalyticsDashboard';
import AdminUserHealth from './AdminUserHealth';
import AdminSportsAgentsPanel from './AdminSportsAgentsPanel';
import AdminPushBroadcast from './AdminPushBroadcast';
import AdminChoraStreams from './AdminChoraStreams';

interface AdminDashboardProps {
  onBack: () => void;
  onReadBook?: (book: Album) => void;
  currentUser: UserProfile;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack, onReadBook, currentUser }) => {
  // Image-optimisation backfill state. stopRef (not state) so the running loop reads the
  // current value rather than the one captured when it started.
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [backfillLog, setBackfillLog] = useState<string[]>([]);
  const backfillStopRef = useRef(false);

  const runImageBackfill = async (kind: 'albums' | 'photos', dryRun: boolean) => {
    setBackfillBusy(true);
    backfillStopRef.current = false;
    setBackfillLog([`${dryRun ? 'Dry run' : 'Optimising'} — ${kind}…`]);
    const push = (m: string) => setBackfillLog(l => [...l.slice(-200), m]);
    try {
      const bf = await import('../services/imageBackfill');
      const run = kind === 'albums' ? bf.backfillAlbumCovers : bf.backfillPhotos;
      const rep = await run({ dryRun, onProgress: push, shouldStop: () => backfillStopRef.current });
      push(bf.summarize(rep));
      if (dryRun) push('Nothing was written. Re-run without "dry" to apply.');
    } catch (e: any) {
      push(`Failed: ${e?.message || e}`);
    } finally {
      setBackfillBusy(false);
    }
  };

  const [activeTab, setActiveTab] = useState<'STATS' | 'ASSETS' | 'LIBRARY' | 'ADS' | 'STAFF' | 'THEMES' | 'MAINTENANCE' | 'FEATURES' | 'UNIVERSE' | 'CURATED' | 'LIVE_FEEDS' | 'LANDING_BG' | 'CLUB_COVER_MEDIA' | 'SPORTS_HERO' | 'ACHIEVEMENTS' | 'ANALYTICS' | 'SPORTS_AGENTS' | 'SITE_HEALTH' | 'USER_HEALTH' | 'ERRORS' | 'UPLOAD_REPORTS' | 'NOTIFY' | 'CHORA_STREAMS' | 'PLATFORM_MEDIA' | 'CHANNEL_NUMBERS' | 'ENDLESS_HOUR'>('STATS');
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [systemSettings, setSystemSettings] = useState<SystemSettingsConfig | null>(null);
  const [contentLicensingOn, setContentLicensingOn] = useState(false);
  useEffect(() => {
    const read = () => setContentLicensingOn(getFlag('CONTENT_LICENSING').enabled);
    read();
    const t = setTimeout(read, 1500); // give the flag listener time to load config/featureFlags
    return () => clearTimeout(t);
  }, []);

  // Curated Content State
  const [allPlaylists, setAllPlaylists] = useState<Playlist[]>([]);
  const [allVideoPlaylists, setAllVideoPlaylists] = useState<VideoPlaylist[]>([]);
  const [allVideos, setAllVideos] = useState<Video[]>([]);
  const [curatedLoading, setCuratedLoading] = useState(false);
  const [isCreatingMusic, setIsCreatingMusic] = useState(false);
  const [isCreatingVideo, setIsCreatingVideo] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [ads, setAds] = useState<AdConfig[]>([]);
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [themeBackgrounds, setThemeBackgrounds] = useState<PostThemeBackground[]>([]);
  const [loading, setLoading] = useState(true);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);
  
  // Public Library State
  const [globalItems, setGlobalItems] = useState<Album[]>([]);
  const [libraryType, setLibraryType] = useState<'MUSIC' | 'VIDEO' | 'BOOK' | 'PHOTO'>('BOOK');
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [editingGlobalItem, setEditingGlobalItem] = useState<Partial<Album> | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncConfig, setSyncConfig] = useState<any>(null);
  
  // Theme Manager State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [editingThemeBg, setEditingThemeBg] = useState<Partial<PostThemeBackground> | null>(null);

  // Asset Manager State
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [userAssets, setUserAssets] = useState<{ albums: Album[], videos: Video[], photos: Photo[], personalTracks: Track[] } | null>(null);
  const [assetSearch, setAssetSearch] = useState('');
  // Admin display-name re-sync (fixes users whose renamed name didn't propagate).
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  const handleAdminRename = async () => {
    if (!selectedUser) return;
    const newName = renameValue.trim();
    if (!newName || newName === selectedUser.displayName) return;
    if (!window.confirm(`Set this user's display name to "${newName}" and re-sync it across all their content?`)) return;
    setIsRenaming(true);
    try {
      // Server pass (Admin SDK) reaches ANY user's content + comments, bypassing client rules.
      const srv = await serverResyncDisplayName(selectedUser.uid, newName).catch(() => ({ ok: false, total: 0 }));
      // Client pass covers anything the caller can already write directly.
      const res = await propagateDisplayName(selectedUser.uid, newName);
      setSelectedUser({ ...selectedUser, displayName: newName });
      setUsers(prev => prev.map(u => u.uid === selectedUser.uid ? { ...u, displayName: newName } : u));
      const total = (srv.ok ? srv.total : 0) + res.total;
      const skipped = !srv.ok && res.skipped.length ? `\n\nServer resync unavailable; some copies may lag.` : '';
      alert(`Display name updated to "${newName}".\nRe-synced across ${total} item${total === 1 ? '' : 's'}.${skipped}`);
    } catch (err) {
      console.error('[handleAdminRename]', err);
      alert('Rename failed — see console.');
    } finally {
      setIsRenaming(false);
    }
  };

  // Ad Manager State
  const [showAdModal, setShowAdModal] = useState(false);
  const [editingAd, setEditingAd] = useState<Partial<AdConfig> | null>(null);
  
  const [showUniverseModal, setShowUniverseModal] = useState(false);
  const [editingUniverse, setEditingUniverse] = useState<Partial<Universe> | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [universeSubTab, setUniverseSubTab] = useState<'ON_PLATFORM' | 'ALLY'>('ON_PLATFORM');

  // Achievement Manager State
  const [allAchievements, setAllAchievements] = useState<Achievement[]>([]);
  const [achLoading, setAchLoading] = useState(false);
  const [editingAch, setEditingAch] = useState<Partial<Achievement> | null>(null);
  const [achSaving, setAchSaving] = useState(false);
  
  const { uploadFile } = useUpload();

  useEffect(() => {
    loadInitialData();
    loadSyncConfig();
    const fetchSettings = async () => {
      const settings = await fetchSystemSettingsConfig();
      setSystemSettings(settings);
    };
    fetchSettings();
  }, []);

  const loadCuratedData = async () => {
    setCuratedLoading(true);
    try {
      const { fetchAllPublicAlbums } = await import('../services/backendService');
      const [playlists, videoPlaylists, videos, albums] = await Promise.all([
        fetchAllPublicPlaylists(),
        fetchAllPublicVideoPlaylists(),
        fetchAllVideos(),
        fetchAllPublicAlbums()
      ]);
      const albumsAsPlaylists = albums.map(a => ({
         id: a.id,
         ownerId: a.ownerId || '',
         authorName: a.artist || 'Curator',
         title: a.title,
         coverImage: a.coverImage || '',
         tracks: a.tracks || [],
         trackIds: (a.tracks || []).map((t: Track) => t.id),
         isPublic: true,
         timestamp: a.createdAt || Date.now()
      } as Playlist));
      setAllPlaylists([...playlists, ...albumsAsPlaylists]);
      setAllVideoPlaylists(videoPlaylists);
      setAllVideos(videos);
    } catch (err) {
      console.error("Failed to load curated data:", err);
    } finally {
      setCuratedLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'CURATED') {
      loadCuratedData();
    }
  }, [activeTab]);

  const handleToggleCurated = async (type: 'MUSIC' | 'VIDEO' | 'MOVIE', id: string) => {
    if (!systemSettings) return;

    let updatedList: string[] = [];
    const field = type === 'MUSIC' ? 'curatedMusicPlaylists' : type === 'VIDEO' ? 'curatedVideoPlaylists' : 'mustWatchMovies';
    
    const currentList = systemSettings[field] || [];
    if (currentList.includes(id)) {
      updatedList = currentList.filter(item => item !== id);
    } else {
      updatedList = [...currentList, id];
    }

    const newSettings = { ...systemSettings, [field]: updatedList };
    await updateSystemSettingsConfig(newSettings);
    setSystemSettings(newSettings);
  };

  const loadSyncConfig = async () => {
    const config = await fetchLibrarySyncConfig();
    setSyncConfig(config);
  };

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [s, u, a, bgs, gi, uni] = await Promise.all([
        fetchSystemStats(),
        fetchAllUsers(),
        fetchAdConfigs(),
        fetchThemeBackgrounds(),
        fetchGlobalArchiveItems(),
        fetchUniverses()
      ]);
      setStats(s);
      setUsers(u);
      setAds(a);
      setThemeBackgrounds(bgs);
      setGlobalItems(gi);
      setUniverses(uni);
    } catch (err) {
      console.error("Failed to load admin data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleMigratePosts = async () => {
    setIsBackfilling(true);
    setBackfillResult("Migrating posts to feed...");
    try {
      const count = await migratePostsToFeed();
      setBackfillResult(`Successfully migrated ${count} posts to the Plajah Social feed.`);
    } catch (e: any) {
      setBackfillResult(`Migration failed: ${e.message}`);
    } finally {
      setIsBackfilling(false);
    }
  };

  const handleBackfillLinerNotes = async () => {
    setIsBackfilling(true);
    setBackfillResult(null);
    try {
      const { fetchAllPublicAlbums, updateCloudAlbum } = await import('../services/backendService');
      const { generateLinerNotes } = await import('../services/geminiService');
      
      const albums = await fetchAllPublicAlbums();
      let updatedCount = 0;

      for (const album of albums) {
        if (!album.linerNotes || album.linerNotes.trim() === "") {
          try {
            const trackNames = album.tracks.map(t => t.title);
            const notes = await generateLinerNotes(album.title, album.artist, trackNames);
            
            await updateCloudAlbum(album.id, {
              ...album,
              linerNotes: notes
            });
            updatedCount++;
          } catch (err) {
            console.error(`Failed for ${album.title}:`, err);
          }
        }
      }
      setBackfillResult(`Liner notes backfill complete. Updated ${updatedCount} albums.`);
    } catch (err) {
      console.error("Backfill failed:", err);
      setBackfillResult("Backfill failed. See console.");
    } finally {
      setIsBackfilling(false);
    }
  };

  const handleBackfillLyrics = async () => {
    setIsBackfilling(true);
    setBackfillResult(null);
    try {
      const { fetchAllPublicAlbums, updateCloudAlbum } = await import('../services/backendService');
      const { generateTrackLyrics } = await import('../services/geminiService');
      
      const albums = await fetchAllPublicAlbums();
      let updatedCount = 0;

      for (const album of albums) {
        let albumModified = false;
        const updatedTracks = [...album.tracks];

        for (let i = 0; i < updatedTracks.length; i++) {
          const track = updatedTracks[i];
          if (!track.lyrics || (typeof track.lyrics === 'string' && track.lyrics.trim() === "") || (Array.isArray(track.lyrics) && track.lyrics.length === 0)) {
            try {
              const lyricsArr = await generateTrackLyrics(track.title, album.artist);
              updatedTracks[i] = { ...track, lyrics: lyricsArr.join('\n') };
              albumModified = true;
            } catch (err) {
              console.error(`Failed track ${track.title}:`, err);
            }
          }
        }

        if (albumModified) {
          await updateCloudAlbum(album.id, {
            ...album,
            tracks: updatedTracks
          });
          updatedCount++;
        }
      }
      setBackfillResult(`Lyrics backfill complete. Updated ${updatedCount} albums.`);
    } catch (err) {
      console.error("Backfill failed:", err);
      setBackfillResult("Backfill failed. See console.");
    } finally {
      setIsBackfilling(false);
    }
  };

  const handleUserSelect = async (user: UserProfile) => {
    setSelectedUser(user);
    setRenameValue(user.displayName || '');
    const assets = await fetchUserAssets(user.uid);
    setUserAssets(assets);
  };

  const handleSaveUniverse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUniverse?.name || !editingUniverse?.type) return;
    if (editingUniverse.type === 'ALLY' && !editingUniverse.url) {
      alert("Please provide a URL for Ally universes.");
      return;
    }

    try {
      let imageUrl = editingUniverse.coverImage;
      if (coverFile) {
        imageUrl = await uploadFile(coverFile, 'PHOTO');
      }
      const uniData = {
        ...editingUniverse,
        id: editingUniverse.id || `uni_${Date.now()}`,
        createdAt: editingUniverse.createdAt || Date.now(),
        coverImage: imageUrl
      } as Universe;

      if (uniData.type === 'ON_PLATFORM') {
        delete uniData.url;
      }

      await saveUniverse(uniData);
      const updatedUniverses = await fetchUniverses();
      setUniverses(updatedUniverses);
      setShowUniverseModal(false);
      setEditingUniverse(null);
      setCoverFile(null);
    } catch (error) {
      console.error("Failed to save universe:", error);
      alert("Failed to save universe. Please check your permissions.");
    }
  };

  const handleSaveAd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAd?.title) return;
    
    const adToSave = {
      id: editingAd.id || `ad_${Date.now()}`,
      title: editingAd.title,
      imageUrl: editingAd.imageUrl || 'https://picsum.photos/seed/ad/800/200',
      linkUrl: editingAd.linkUrl || '#',
      placement: editingAd.placement || 'BANNER',
      isActive: editingAd.isActive ?? true,
      impressions: editingAd.impressions || 0,
      clicks: editingAd.clicks || 0,
      targetGenres: editingAd.targetGenres || []
    } as AdConfig;

    await updateAdConfig(adToSave);
    const updatedAds = await fetchAdConfigs();
    setAds(updatedAds);
    setShowAdModal(false);
    setEditingAd(null);
  };

  const handleAnalyzeBackground = async (url: string) => {
    if (!editingThemeBg?.theme) return;
    setIsAnalyzing(true);
    try {
      // Convert URL to base64 for Gemini
      const response = await fetch(url);
      const blob = await response.blob();
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(blob);
      });
      const base64 = await base64Promise;
      
      const zones = await analyzeThemeBackground(base64, editingThemeBg.theme);
      setEditingThemeBg(prev => ({ ...prev, zones, imageUrl: url }));
    } catch (err) {
      console.error("AI Analysis failed:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveThemeBg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingThemeBg?.imageUrl || !editingThemeBg?.name) return;
    
    await saveThemeBackground(editingThemeBg);
    const updated = await fetchThemeBackgrounds();
    setThemeBackgrounds(updated);
    setShowThemeModal(false);
    setEditingThemeBg(null);
  };

  const handleSaveGlobalItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGlobalItem?.title) return;
    
    await saveGlobalArchiveItem(editingGlobalItem);
    const updated = await fetchGlobalArchiveItems(libraryType);
    setGlobalItems(updated);
    setShowLibraryModal(false);
    setEditingGlobalItem(null);
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    await syncLibraryOfCongressBooks();
    await loadSyncConfig();
    const updated = await fetchGlobalArchiveItems(libraryType);
    setGlobalItems(updated);
    setIsSyncing(false);
  };

  const handleToggleAutoSync = async () => {
    const newConfig = { ...syncConfig, autoSync: !syncConfig?.autoSync };
    await updateLibrarySyncConfig(newConfig);
    setSyncConfig(newConfig);
  };

  const handleLibraryTypeChange = async (type: 'MUSIC' | 'VIDEO' | 'BOOK' | 'PHOTO') => {
    setLibraryType(type);
    const items = await fetchGlobalArchiveItems(type);
    setGlobalItems(items);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-color)] flex flex-col items-center justify-center">
        <div className="w-16 h-16 border-4 border-white/10 border-t-white rounded-full animate-spin mb-6" />
        <p className="text-xs font-black uppercase tracking-widest text-white/40">Initializing Admin Secure Layer...</p>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[var(--bg-color)] text-white flex flex-col lg:flex-row overflow-hidden">
      {/* Admin Sidebar.
          `min-h-0` matters: a flex child will not shrink below its content without it, so
          without it the nav below cannot scroll no matter what overflow it is given. */}
      <aside className="w-full lg:w-80 shrink-0 border-r border-white/5 flex flex-col min-h-0 p-8 bg-black/40 backdrop-blur-3xl z-50">
        <div className="flex items-center gap-4 mb-12">
          <div className="w-12 h-12 rounded-2xl bg-red-600 flex items-center justify-center shadow-[0_0_30px_rgba(220,38,38,0.3)]">
            <Shield size={24} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight text-white">System Admin</h2>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-red-500">Root Access</p>
          </div>
        </div>

        {/* Twenty-four tabs do not fit on a laptop. Without this the list was simply clipped —
            no scrollbar, no indication anything was below — and every tab past about the
            eleventh was unreachable rather than merely hidden. */}
        <nav className="flex-1 min-h-0 overflow-y-auto space-y-2 -mr-3 pr-3">
          {[
            { id: 'ANALYTICS', label: 'Analytics', icon: BarChart3 },
            { id: 'SITE_HEALTH', label: 'Site Health', icon: Activity },
            { id: 'USER_HEALTH', label: 'User Health', icon: Activity },
            { id: 'NOTIFY', label: 'Push Broadcast', icon: Bell },
            { id: 'ERRORS', label: 'Errors', icon: AlertTriangle },
            { id: 'UPLOAD_REPORTS', label: 'Upload Reports', icon: UploadCloud },
            { id: 'STATS', label: 'Stats (Legacy)', icon: Database },
            { id: 'SPORTS_AGENTS', label: 'Sports Agents', icon: Trophy },
            { id: 'LIBRARY', label: 'Public Library', icon: LibraryBig },
            { id: 'CHORA_STREAMS', label: 'Chora Streaming', icon: Music },
            { id: 'ASSETS', label: 'User Assets', icon: FolderTree },
            { id: 'ADS', label: 'Ad Platform', icon: Megaphone },
            { id: 'THEMES', label: 'Theme Manager', icon: Palette },
            { id: 'ACHIEVEMENTS', label: 'Achievements & Points', icon: Trophy },
            { id: 'LIVE_FEEDS', label: 'Live Feeds', icon: Radio },
            { id: 'CHANNEL_NUMBERS', label: 'Channel Numbers', icon: Hash },
            { id: 'ENDLESS_HOUR', label: 'Endless Hour', icon: Radio },
            { id: 'PLATFORM_MEDIA', label: 'Plajah Media Library', icon: Tv },
            { id: 'LANDING_BG', label: 'Landing Background', icon: ImageIcon },
            { id: 'CLUB_COVER_MEDIA', label: 'Club Cover Media', icon: VideoIcon },
            { id: 'SPORTS_HERO', label: 'Sports Hero Images', icon: ImageIcon },
            { id: 'CURATED', label: 'Curated Content', icon: Sparkles },
            { id: 'FEATURES', label: 'Feature Toggles', icon: Zap },
            { id: 'MAINTENANCE', label: 'Maintenance', icon: Settings },
            { id: 'STAFF', label: 'Staff Accounts', icon: Lock },
            { id: 'UNIVERSE', label: 'Universe Manager', icon: Globe },
          ].map(item => (
            <button 
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all ${
                activeTab === item.id 
                  ? 'bg-white text-black shadow-xl scale-[1.02]' 
                  : 'text-white/40 hover:text-white hover:bg-white/5'
              }`}
            >
              <item.icon size={18} />
              <span className="text-[10px] font-black uppercase tracking-widest">{item.label}</span>
            </button>
          ))}
        </nav>

        <button 
          onClick={onBack}
          className="shrink-0 mt-4 pt-4 border-t border-white/5 flex items-center gap-4 px-6 py-4 text-white/20 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest group"
        >
          <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" /> 
          Exit System Admin
        </button>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-8 lg:p-16 relative">
        <div className="max-w-6xl mx-auto">
          <AnimatePresence mode="wait">
            {activeTab === 'STATS' && stats && (
              <motion.div 
                key="stats"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-12"
              >
                <header className="space-y-2">
                  <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Site Health</h1>
                  <p className="text-white/40 text-sm font-bold uppercase tracking-widest">Real-time platform performance metrics</p>
                </header>

                {/* Top Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  {[
                    { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'text-blue-500' },
                    { label: 'Active (24h)', value: stats.activeUsers24h, icon: Activity, color: 'text-green-500' },
                    { label: 'Storage Used', value: formatSize(stats.globalStorage.total), icon: HardDrive, color: 'text-purple-500' },
                    { label: 'Daily Bandwidth', value: formatSize(stats.globalBandwidth.daily), icon: BarChart3, color: 'text-orange-500' },
                  ].map(stat => (
                    <div key={stat.label} className="p-8 bg-white/5 border border-white/5 rounded-[2.5rem] relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <stat.icon size={64} />
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">{stat.label}</p>
                      <p className={`text-3xl font-black tracking-tight ${stat.color}`}>{stat.value}</p>
                    </div>
                  ))}
                </div>

                {/* Storage Breakdown */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="p-10 bg-white/5 border border-white/5 rounded-[3rem] space-y-8">
                    <h3 className="text-xl font-black uppercase tracking-widest flex items-center gap-3">
                      <Database className="text-purple-500" size={20} />
                      Storage per Section
                    </h3>
                    <div className="space-y-6">
                      {[
                        { label: 'Music & Audio', value: stats.globalStorage.audio, color: 'bg-blue-500' },
                        { label: 'Video Content', value: stats.globalStorage.video, color: 'bg-red-500' },
                        { label: 'Photos & Art', value: stats.globalStorage.photos, color: 'bg-green-500' },
                      ].map(item => (
                        <div key={item.label} className="space-y-2">
                          <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                            <span className="text-white/40">{item.label}</span>
                            <span>{formatSize(item.value)}</span>
                          </div>
                          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                            <div 
                              className={`h-full ${item.color}`} 
                              style={{ width: `${(item.value / stats.globalStorage.total) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-10 bg-white/5 border border-white/5 rounded-[3rem] space-y-8">
                    <h3 className="text-xl font-black uppercase tracking-widest flex items-center gap-3">
                      <BarChart3 className="text-orange-500" size={20} />
                      Global Activity
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { label: 'Music Albums', value: stats.sectionUsage.music },
                        { label: 'Videos Uploaded', value: stats.sectionUsage.video },
                        { label: 'Books in Shelf', value: stats.sectionUsage.books },
                        { label: 'Photos Shared', value: stats.sectionUsage.photos },
                      ].map(item => (
                        <div key={item.label} className="p-6 bg-black/40 rounded-3xl border border-white/5">
                          <p className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-1">{item.label}</p>
                          <p className="text-2xl font-black">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'SPORTS_AGENTS' && (
              <motion.div
                key="sportsAgents"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <AdminSportsAgentsPanel />
              </motion.div>
            )}

            {activeTab === 'UNIVERSE' && (
              <motion.div 
                key="universe"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-12"
              >
                  <header className="flex items-end justify-between">
                    <div className="space-y-4">
                        <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Universe Manager</h1>
                        <div className="flex gap-4 p-2 bg-white/5 rounded-3xl w-fit">
                          {(['ON_PLATFORM', 'ALLY'] as const).map(tab => (
                            <button
                              key={tab}
                              onClick={() => setUniverseSubTab(tab)}
                              className={`px-6 py-3 rounded-2xl flex items-center gap-3 transition-all ${
                                universeSubTab === tab ? 'bg-white text-black shadow-lg scale-105' : 'text-white/40 hover:text-white'
                              }`}
                            >
                              <span className="text-[10px] font-black uppercase tracking-widest">{tab === 'ON_PLATFORM' ? 'On Platform' : 'Ally Links'}</span>
                            </button>
                          ))}
                        </div>
                    </div>
                    <button 
                      onClick={() => {
                        setEditingUniverse({ type: universeSubTab, name: '', description: '', coverImage: '' });
                        setShowUniverseModal(true);
                      }}
                      className="flex items-center gap-2 px-8 py-4 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-xl"
                    >
                        <Plus size={16} /> Create {universeSubTab === 'ON_PLATFORM' ? 'Platform' : 'Ally'} Universe
                    </button>
                  </header>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {universes.filter(u => u.type === universeSubTab).map(uni => (
                        <div key={uni.id} className="p-6 bg-white/5 border border-white/5 rounded-3xl">
                            {uni.coverImage && <img src={uni.coverImage || null} className="aspect-video w-full rounded-2xl mb-4 object-cover" />}
                            <h3 className="text-xl font-black uppercase tracking-tight">{uni.name}</h3>
                            <p className="text-xs text-white/40 uppercase mb-4">{uni.type}</p>
                            <div className="flex gap-2">
                                <button onClick={() => { setEditingUniverse(uni); setShowUniverseModal(true); }} className="p-2 bg-white/10 rounded-lg">Edit</button>
                                <button onClick={async() => { await deleteUniverse(uni.id); setUniverses(universes.filter(u => u.id !== uni.id)); }} className="p-2 bg-red-600/20 text-red-400 rounded-lg">Delete</button>
                            </div>
                        </div>
                    ))}
                  </div>
              </motion.div>
            )}

            {activeTab === 'ASSETS' && (
              <motion.div 
                key="assets"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <header className="flex items-end justify-between">
                  <div className="space-y-2">
                    <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Asset Manager</h1>
                  <p className="text-white/40 text-sm font-bold uppercase tracking-widest mt-2">Manage all uploaded media and files across the platform</p>
                    <p className="text-white/40 text-sm font-bold uppercase tracking-widest">Browse user file structures and media</p>
                  </div>
                  {selectedUser && (
                    <button 
                      onClick={() => setSelectedUser(null)}
                      className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 rounded-full text-[10px] font-black uppercase tracking-widest transition-all"
                    >
                      <ArrowLeft size={14} /> Back to Users
                    </button>
                  )}
                </header>

                {!selectedUser ? (
                  <div className="space-y-6">
                    <div className="relative">
                      <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-white/20" size={20} />
                      <input 
                        type="text"
                        placeholder="Search users by name or email..."
                        value={assetSearch}
                        onChange={(e) => setAssetSearch(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-[2rem] py-6 pl-16 pr-8 text-lg font-bold outline-none focus:border-white/30 transition-all"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {users.filter(u => 
                        u.displayName.toLowerCase().includes(assetSearch.toLowerCase()) || 
                        u.email.toLowerCase().includes(assetSearch.toLowerCase())
                      ).map(user => (
                        <button 
                          key={user.uid}
                          onClick={() => handleUserSelect(user)}
                          className="flex items-center justify-between p-6 bg-white/5 border border-white/5 rounded-3xl hover:bg-white/10 transition-all group text-left"
                        >
                          <div className="flex items-center gap-4">
                            <img src={user.photoURL || null} alt="" className="w-12 h-12 rounded-xl object-cover" />
                            <div>
                              <h4 className="font-black uppercase tracking-wider text-sm">{user.displayName}</h4>
                            </div>
                          </div>
                          <ChevronRight className="text-white/20 group-hover:text-white group-hover:translate-x-1 transition-all" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-12">
                    {/* User Header */}
                    <div className="flex items-center gap-6 p-8 bg-white/5 border border-white/5 rounded-[3rem]">
                      <img src={selectedUser.photoURL || null} alt="" className="w-24 h-24 rounded-[2rem] object-cover" />
                      <div>
                        <h2 className="text-3xl font-black uppercase tracking-tight">{selectedUser.displayName}</h2>
                        <p className="text-white/40 font-bold uppercase tracking-widest text-xs mb-4">{selectedUser.uid}</p>
                        <div className="flex gap-4">
                          <div className="px-4 py-2 bg-white/5 rounded-xl text-[9px] font-black uppercase tracking-widest">
                            {userAssets?.albums.length || 0} Releases
                          </div>
                          <div className="px-4 py-2 bg-white/5 rounded-xl text-[9px] font-black uppercase tracking-widest">
                            {userAssets?.videos.length || 0} Videos
                          </div>
                          <div className="px-4 py-2 bg-white/5 rounded-xl text-[9px] font-black uppercase tracking-widest">
                            {userAssets?.photos.length || 0} Photos
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Display-name re-sync — set the account name and propagate it everywhere */}
                    <div className="p-6 bg-white/5 border border-white/5 rounded-[2rem] space-y-3">
                      <h3 className="text-xs font-black uppercase tracking-widest text-white/40">Display Name — re-sync everywhere</h3>
                      <p className="text-[10px] text-white/30 font-medium leading-relaxed">
                        Sets the account display name and re-writes every denormalized copy (posts, comments, rooms, clubs…).
                        Artist / persona names on releases are intentionally left untouched.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          placeholder="Display name"
                          className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-5 py-3 text-sm font-bold outline-none focus:ring-2 ring-white/20"
                        />
                        <button
                          onClick={handleAdminRename}
                          disabled={isRenaming || !renameValue.trim() || renameValue.trim() === selectedUser.displayName}
                          className="px-6 py-3 bg-white text-black rounded-2xl text-[11px] font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/90 transition-all"
                        >
                          {isRenaming ? 'Re-syncing…' : 'Rename & re-sync'}
                        </button>
                      </div>
                    </div>

                    {/* Asset Folders */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {/* Releases Section — a film, a book and a record all live in `albums`,
                          so this list must read the type off each doc. It used to be headed
                          "Music Albums" and count "N Tracks" for everything, which showed a
                          feature film as a music album with 0 tracks. */}
                      <div className="space-y-4">
                        <h3 className="text-xs font-black uppercase tracking-widest text-white/40 ml-4">Releases</h3>
                        <div className="space-y-2">
                          {userAssets?.albums.map(album => {
                            const kind = albumKindLabel(album);
                            const missing = isMissingMedia(album);
                            return (
                            <div key={album.id} className="p-4 bg-white/5 border rounded-2xl flex items-center justify-between"
                                 style={{ borderColor: missing ? '#e2473b66' : 'rgba(255,255,255,0.05)' }}>
                              <div className="flex items-center gap-4 min-w-0">
                                <img src={album.coverImage || null} className="w-10 h-10 rounded-lg object-cover shrink-0" alt="" />
                                <div className="min-w-0">
                                  <p className="text-sm font-bold uppercase tracking-wider truncate">{album.title}</p>
                                  <p className="text-[9px] font-black text-white/20 uppercase tracking-widest">
                                    {kind} · {albumItemCount(album)}
                                    {missing && <span style={{ color: '#e2473b' }}> · No media attached</span>}
                                  </p>
                                </div>
                              </div>
                              <Eye size={16} className="text-white/20 shrink-0" />
                            </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Personal Tracks Section */}
                      <div className="space-y-4">
                        <h3 className="text-xs font-black uppercase tracking-widest text-white/40 ml-4">Personal Vault</h3>
                        <div className="space-y-2">
                          {userAssets?.personalTracks.map(track => (
                            <div key={track.id} className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                                  <FileAudio size={20} className="text-blue-400" />
                                </div>
                                <div>
                                  <p className="text-sm font-bold uppercase tracking-wider">{track.title}</p>
                                  <p className="text-[9px] font-black text-white/20 uppercase tracking-widest">Private Asset</p>
                                </div>
                              </div>
                              <a href={track.url} target="_blank" rel="noreferrer" className="text-white/20 hover:text-white transition-colors">
                                <ExternalLink size={16} />
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'LIBRARY' && (
              <motion.div 
                key="library"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-12"
              >
                <header className="flex items-end justify-between">
                  <div className="space-y-2">
                    <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Public Library</h1>
                  <p className="text-white/40 text-sm font-bold uppercase tracking-widest mt-2">Oversee all published contents in the global archive</p>
                    <p className="text-white/40 text-sm font-bold uppercase tracking-widest">Load and manage global assets across the platform</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="hidden xl:flex items-center gap-6 px-8 py-4 bg-white/5 border border-white/10 rounded-[2rem]">
                      <div className="flex flex-col">
                        <span className="text-[8px] font-black uppercase tracking-widest text-white/20">LoC Automator</span>
                        <div className="flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${syncConfig?.autoSync ? 'bg-green-500 animate-pulse' : 'bg-white/20'}`} />
                          <span className="text-[10px] font-black uppercase tracking-tight">Daily Sync {syncConfig?.autoSync ? 'Active' : 'Paused'}</span>
                        </div>
                      </div>
                      <div className="h-6 w-px bg-white/10" />
                      <div className="flex flex-col">
                        <span className="text-[8px] font-black uppercase tracking-widest text-white/20">Last Fetch</span>
                        <div className="flex items-center gap-2">
                          <Clock size={10} className="text-small-orange" />
                          <span className="text-[10px] font-black uppercase tracking-tight">
                            {syncConfig?.lastSync ? new Date(syncConfig.lastSync).toLocaleDateString() : 'Never'}
                          </span>
                        </div>
                      </div>
                      <button 
                        onClick={handleManualSync}
                        disabled={isSyncing}
                        className={`flex items-center gap-2 px-6 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${isSyncing ? 'bg-white/10 text-white/40 cursor-not-allowed' : 'bg-small-orange text-black hover:scale-105 active:scale-95'}`}
                      >
                        {isSyncing ? <Loader2 size={12} className="animate-spin" /> : <CloudDownload size={12} />}
                        Sync Now
                      </button>
                      <button 
                        onClick={handleToggleAutoSync}
                        className={`p-2 rounded-lg border transition-all ${syncConfig?.autoSync ? 'border-green-500/50 text-green-500' : 'border-white/10 text-white/20'}`}
                        title="Toggle Library of Congress Daily Automator"
                      >
                        <ShieldCheck size={16} />
                      </button>
                    </div>
                    <button 
                      onClick={() => {
                        setEditingGlobalItem({ type: libraryType, tracks: [], bookChapters: [], themeColor: '#1a1a1a', artist: 'Public Archive' });
                        setShowLibraryModal(true);
                      }}
                      className="flex items-center gap-2 px-8 py-4 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-xl"
                    >
                      <Plus size={16} /> Load New Asset
                    </button>
                  </div>
                </header>

                <div className="flex gap-4 p-2 bg-white/5 rounded-3xl w-fit">
                  {[
                    { id: 'BOOK', label: 'Books', icon: BookOpen },
                    { id: 'MUSIC', label: 'Audio', icon: Music },
                    { id: 'VIDEO', label: 'Visuals', icon: VideoIcon },
                    { id: 'PHOTO', label: 'Gallery', icon: ImageIcon },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => handleLibraryTypeChange(tab.id as any)}
                      className={`px-6 py-3 rounded-2xl flex items-center gap-3 transition-all ${
                        libraryType === tab.id ? 'bg-white text-black shadow-lg scale-105' : 'text-white/40 hover:text-white'
                      }`}
                    >
                      <tab.icon size={16} />
                      <span className="text-[10px] font-black uppercase tracking-widest">{tab.label}</span>
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {globalItems.map(item => (
                    <div key={item.id} className="bg-white/5 border border-white/5 rounded-[2.5rem] overflow-hidden group h-full flex flex-col">
                      <div className="aspect-[4/5] relative shrink-0">
                         <img src={item.coverImage || null} className="w-full h-full object-cover" alt="" />
                         <div className="absolute inset-0 bg-black/90 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-8 gap-3 text-center">
                            <h4 className="text-base font-black uppercase tracking-tight">{item.title}</h4>
                            <div className="flex flex-wrap justify-center gap-2 mt-4">
                              <button 
                                onClick={() => { setEditingGlobalItem(item); setShowLibraryModal(true); }}
                                className="p-3 bg-white/10 hover:bg-white text-white/60 hover:text-black rounded-xl transition-all"
                                title="Edit Item"
                              >
                                <Settings size={16} />
                              </button>
                              <button 
                                onClick={async () => {
                                  await resyncBookItem(item.id);
                                  handleLibraryTypeChange(libraryType);
                                }}
                                className="p-3 bg-white/10 hover:bg-small-orange text-white/60 hover:text-black rounded-xl transition-all"
                                title="Force Manual Resync"
                              >
                                <RefreshCw size={16} />
                              </button>
                              {item.type === 'BOOK' && onReadBook && (
                                <button 
                                  onClick={() => onReadBook(item)}
                                  className="p-3 bg-white/10 hover:bg-blue-500 text-white/60 hover:text-white rounded-xl transition-all"
                                  title="Verify Content (Read)"
                                >
                                  <BookOpen size={16} />
                                </button>
                              )}
                              <button 
                                onClick={async () => {
                                  await toggleGlobalArchiveVisibility(item.id, !item.isPublic);
                                  handleLibraryTypeChange(libraryType);
                                }}
                                className={`p-3 bg-white/10 rounded-xl transition-all ${item.isPublic ? 'hover:bg-yellow-500 text-yellow-500/60 hover:text-black' : 'hover:bg-green-500 text-green-500/60 hover:text-white'}`}
                                title={item.isPublic ? "Hide from Platform" : "Show on Platform"}
                              >
                                {item.isPublic ? <Eye size={16} /> : <Eye size={16} className="opacity-40" />}
                              </button>
                              <button 
                                onClick={async () => {
                                  if (window.confirm('Delete this archive item?')) {
                                    await deleteGlobalArchiveItem(item.id);
                                    setGlobalItems(globalItems.filter(g => g.id !== item.id));
                                  }
                                }}
                                className="p-3 bg-white/10 hover:bg-red-600 text-white/60 hover:text-white rounded-xl transition-all"
                                title="Delete"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                         </div>
                      </div>
                      <div className="p-6 flex-1 flex flex-col">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="text-sm font-black uppercase tracking-wider truncate mr-2">{item.title}</h4>
                          <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 bg-white/10 rounded shrink-0">{item.type}</span>
                        </div>
                        <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest mt-auto">{item.artist}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'ADS' && (
              <motion.div 
                key="ads"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="space-y-12"
              >
                <header className="flex items-end justify-between">
                  <div className="space-y-2">
                    <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Ad Platform</h1>
                  <p className="text-white/40 text-sm font-bold uppercase tracking-widest mt-2">Configure campaigns, placements and revenue streams</p>
                    <p className="text-white/40 text-sm font-bold uppercase tracking-widest">Manage site-wide advertising and placements</p>
                  </div>
                  <button 
                    onClick={() => {
                      setEditingAd({});
                      setShowAdModal(true);
                    }}
                    className="flex items-center gap-2 px-8 py-4 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-xl"
                  >
                    <Plus size={16} /> Create New Campaign
                  </button>
                </header>

                <div className="grid grid-cols-1 gap-6">
                  {ads.map(ad => (
                    <div key={ad.id} className="p-8 bg-white/5 border border-white/5 rounded-[3rem] flex flex-col md:flex-row gap-8 items-center">
                      <img src={ad.imageUrl || null} alt="" className="w-full md:w-64 h-32 rounded-2xl object-cover border border-white/10" />
                      <div className="flex-1 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-xl font-black uppercase tracking-tight">{ad.title}</h3>
                            <p className="text-[10px] font-black uppercase tracking-widest text-white/40">{ad.placement} Placement</p>
                          </div>
                          <div className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                            ad.isActive ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-white/20'
                          }`}>
                            {ad.isActive ? 'Active' : 'Paused'}
                          </div>
                        </div>
                        <div className="flex gap-8">
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-1">Impressions</p>
                            <p className="text-lg font-black">{ad.impressions.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-1">Clicks</p>
                            <p className="text-lg font-black">{ad.clicks.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-1">CTR</p>
                            <p className="text-lg font-black">
                              {ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(2) : '0.00'}%
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            setEditingAd(ad);
                            setShowAdModal(true);
                          }}
                          className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl transition-all"
                        >
                          <Settings size={20} />
                        </button>
                        <button 
                          onClick={async () => {
                            if (window.confirm('Delete this ad?')) {
                              await deleteAdConfig(ad.id);
                              setAds(ads.filter(a => a.id !== ad.id));
                            }
                          }}
                          className="p-4 bg-white/5 hover:bg-red-500/20 hover:text-red-500 rounded-2xl transition-all"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'THEMES' && (
              <motion.div 
                key="themes"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-12"
              >
                <header className="flex items-end justify-between">
                  <div className="space-y-2">
                    <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Theme Manager</h1>
                  <p className="text-white/40 text-sm font-bold uppercase tracking-widest mt-2">Customize the visual aesthetics of the application</p>
                    <p className="text-white/40 text-sm font-bold uppercase tracking-widest">Configure AI-powered backgrounds for post themes</p>
                  </div>
                  <button 
                    onClick={() => {
                      setEditingThemeBg({ theme: 'SCRAPBOOK', zones: [], name: '' });
                      setShowThemeModal(true);
                    }}
                    className="flex items-center gap-2 px-8 py-4 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-xl"
                  >
                    <Plus size={16} /> Add Background
                  </button>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {themeBackgrounds.map(bg => (
                    <div key={bg.id} className="bg-white/5 border border-white/5 rounded-[2.5rem] overflow-hidden group">
                      <div className="aspect-video relative">
                        <img src={bg.imageUrl || null} className="w-full h-full object-cover" alt="" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                          <button 
                            onClick={() => {
                              setEditingThemeBg(bg);
                              setShowThemeModal(true);
                            }}
                            className="p-4 bg-white text-black rounded-2xl hover:scale-110 transition-all"
                          >
                            <Settings size={20} />
                          </button>
                          <button 
                            onClick={async () => {
                              if (window.confirm('Delete this background?')) {
                                await deleteThemeBackground(bg.id);
                                setThemeBackgrounds(themeBackgrounds.filter(b => b.id !== bg.id));
                              }
                            }}
                            className="p-4 bg-red-600 text-white rounded-2xl hover:scale-110 transition-all"
                          >
                            <Trash2 size={20} />
                          </button>
                        </div>
                      </div>
                      <div className="p-6">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="text-sm font-black uppercase tracking-wider">{bg.name}</h4>
                          <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 bg-white/10 rounded">{bg.theme}</span>
                        </div>
                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{bg.zones.length} AI Zones Detected</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Theme Preset Manager Section */}
                <div className="pt-20 border-t border-white/5">
                  <ThemePresetManager currentUser={currentUser} isAdmin={true} />
                </div>
              </motion.div>
            )}

            {activeTab === 'LIVE_FEEDS' && (
              <motion.div
                key="liveFeeds"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="h-full"
              >
                <AdminLiveFeedsManager />
              </motion.div>
            )}

            {activeTab === 'CHANNEL_NUMBERS' && (
              <motion.div
                key="channelNumbers"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="h-full overflow-y-auto"
              >
                <ChannelNumberMigration />
              </motion.div>
            )}

            {activeTab === 'ENDLESS_HOUR' && (
              <motion.div
                key="endlessHour"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="h-full overflow-y-auto"
              >
                <AdminEndlessHour />
              </motion.div>
            )}

            {activeTab === 'PLATFORM_MEDIA' && (
              <motion.div
                key="platformMedia"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-6xl"
              >
                <AdminPlatformMediaLibrary />
              </motion.div>
            )}

            {activeTab === 'LANDING_BG' && (
              <motion.div
                key="landingBg"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-5xl"
              >
                <AdminLandingBgManager />
              </motion.div>
            )}

            {activeTab === 'CLUB_COVER_MEDIA' && (
              <motion.div
                key="clubCoverMedia"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-5xl"
              >
                <AdminClubCoverMediaManager />
              </motion.div>
            )}

            {activeTab === 'SPORTS_HERO' && (
              <motion.div
                key="sportsHero"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-5xl"
              >
                <AdminSportsHeroManager />
              </motion.div>
            )}

            {activeTab === 'ERRORS' && (
              <motion.div key="errors" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-5xl">
                <ErrorReportsPanel />
              </motion.div>
            )}

            {activeTab === 'UPLOAD_REPORTS' && (
              <motion.div
                key="uploadReports"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <UploadReportsPanel />
              </motion.div>
            )}

            {activeTab === 'USER_HEALTH' && (
              <motion.div key="userHealth" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-5xl">
                <AdminUserHealth />
              </motion.div>
            )}

            {activeTab === 'NOTIFY' && (
              <motion.div key="notify" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-5xl">
                <AdminPushBroadcast users={users} />
              </motion.div>
            )}

            {activeTab === 'CHORA_STREAMS' && (
              <AdminChoraStreams key="choraStreams" />
            )}

            {activeTab === 'SITE_HEALTH' && (
              <motion.div
                key="siteHealth"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-5xl"
              >
                <AdminSiteHealth />
              </motion.div>
            )}

            {activeTab === 'ACHIEVEMENTS' && (
              <motion.div
                key="achievements"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-10 max-w-5xl"
              >
                <div className="flex items-end justify-between">
                  <div>
                    <h1 className="text-6xl md:text-[8rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Achievements</h1>
                    <p className="text-white/40 text-sm font-bold uppercase tracking-widest mt-4">Define platform achievements, set points values, and manage unlocks</p>
                  </div>
                  <button
                    onClick={() => {
                      setEditingAch({ title: '', description: '', category: 'USER', triggerType: 'CUSTOM', icon: 'Trophy', pointsValue: 10, isActive: true, createdBy: 'SYSTEM' });
                      if (allAchievements.length === 0) {
                        setAchLoading(true);
                        fetchAllAchievements().then(a => { setAllAchievements(a); setAchLoading(false); });
                      }
                    }}
                    className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all"
                  >
                    <Plus size={14} /> New Achievement
                  </button>
                </div>

                {/* Load achievements on tab open */}
                {allAchievements.length === 0 && !achLoading && (() => {
                  setAchLoading(true);
                  fetchAllAchievements().then(a => { setAllAchievements(a); setAchLoading(false); });
                  return null;
                })()}

                {achLoading && (
                  <div className="flex items-center gap-3 text-white/40">
                    <Loader2 size={16} className="animate-spin" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Loading achievements…</span>
                  </div>
                )}

                {/* Achievement list */}
                <div className="space-y-3">
                  {[
                    // Hard-coded base achievements that always show
                    { id: 'welcome_to_playground', title: 'Welcome To The Playground', description: 'Joined Plajah — the stage is yours', category: 'USER', pointsValue: 100, icon: 'Trophy', isActive: true, triggerType: 'FIRST_SIGN_IN', createdBy: 'SYSTEM', requirements: { type: 'ACTION' }, createdAt: 0, updatedAt: 0 },
                    { id: 'first_play', title: 'First Contact', description: 'Played your first track on Plajah', category: 'USER', pointsValue: 10, icon: 'Zap', isActive: true, triggerType: 'FIRST_PLAY', createdBy: 'SYSTEM', requirements: { type: 'ACTION' }, createdAt: 0, updatedAt: 0 },
                    { id: 'first_upload', title: 'Creator Spirit', description: 'Uploaded your first piece of content', category: 'ARTIST', pointsValue: 50, icon: 'Upload', isActive: true, triggerType: 'FIRST_UPLOAD', createdBy: 'SYSTEM', requirements: { type: 'ACTION' }, createdAt: 0, updatedAt: 0 },
                    { id: 'first_follow', title: 'Networker', description: 'Followed your first artist', category: 'USER', pointsValue: 20, icon: 'Users', isActive: true, triggerType: 'FIRST_FOLLOW', createdBy: 'SYSTEM', requirements: { type: 'ACTION' }, createdAt: 0, updatedAt: 0 },
                    { id: 'lucky_roll', title: 'Feeling Lucky', description: 'Used the dice roll for discovery', category: 'USER', pointsValue: 15, icon: 'Dices', isActive: true, triggerType: 'USE_FEELING_LUCKY', createdBy: 'SYSTEM', requirements: { type: 'ACTION' }, createdAt: 0, updatedAt: 0 },
                    { id: 'live_viewer', title: 'Live Witness', description: 'Watched a live stream for the first time', category: 'USER', pointsValue: 25, icon: 'Radio', isActive: true, triggerType: 'WATCH_LIVE', createdBy: 'SYSTEM', requirements: { type: 'ACTION' }, createdAt: 0, updatedAt: 0 },
                    { id: 'commenter', title: 'Voice of the People', description: 'Posted your first comment', category: 'USER', pointsValue: 10, icon: 'MessageSquare', isActive: true, triggerType: 'POST_COMMENT', createdBy: 'SYSTEM', requirements: { type: 'ACTION' }, createdAt: 0, updatedAt: 0 },
                    { id: 'hns_first', title: 'Ghost Track', description: 'Discovered your first hidden alternate in Hide N Seek', category: 'USER', pointsValue: 15, icon: 'Ghost', isActive: true, triggerType: 'HNS_DISCOVER_FIRST', createdBy: 'SYSTEM', requirements: { type: 'ACTION' }, createdAt: 0, updatedAt: 0 },
                    { id: 'hns_both_slots', title: 'Both Sides Now', description: 'Heard both alternates for a single track in Hide N Seek', category: 'USER', pointsValue: 25, icon: 'Shuffle', isActive: true, triggerType: 'HNS_BOTH_SLOTS', createdBy: 'SYSTEM', requirements: { type: 'ACTION' }, createdAt: 0, updatedAt: 0 },
                    { id: 'hns_artist_10', title: 'Hidden Gem', description: 'Your hidden tracks were discovered by 10 unique listeners', category: 'ARTIST', pointsValue: 75, icon: 'Gem', isActive: true, triggerType: 'HNS_ARTIST_10', createdBy: 'SYSTEM', requirements: { type: 'METRIC' }, createdAt: 0, updatedAt: 0 },
                    { id: 'hns_artist_50', title: 'Going Viral', description: 'Your hidden tracks were discovered by 50 unique listeners', category: 'ARTIST', pointsValue: 150, icon: 'TrendingUp', isActive: true, triggerType: 'HNS_ARTIST_50', createdBy: 'SYSTEM', requirements: { type: 'METRIC' }, createdAt: 0, updatedAt: 0 },
                    { id: 'theme_add_first', title: 'Decorator', description: 'Added your first theme to your library', category: 'USER', pointsValue: 5, icon: 'Palette', isActive: true, triggerType: 'THEME_FIRST_ADD', createdBy: 'SYSTEM', requirements: { type: 'ACTION' }, createdAt: 0, updatedAt: 0 },
                    { id: 'theme_creator_fan', title: 'Inspired', description: 'Someone added your theme to their library', category: 'ARTIST', pointsValue: 10, icon: 'Sparkles', isActive: true, triggerType: 'THEME_RECEIVED', createdBy: 'SYSTEM', requirements: { type: 'ACTION' }, createdAt: 0, updatedAt: 0 },
                    ...allAchievements.filter(a => !['welcome_to_playground','first_play','first_upload','first_follow','lucky_roll','live_viewer','commenter','hns_first','hns_both_slots','hns_artist_10','hns_artist_50','theme_add_first','theme_creator_fan'].includes(a.id))
                  ].map((ach: any) => (
                    <div key={ach.id} className="flex items-center gap-5 p-5 bg-white/5 border border-white/10 rounded-2xl hover:border-white/20 transition-all group">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: ach.backgroundColor || 'rgba(255,140,0,0.2)' }}>
                        <Trophy size={20} className="text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-black uppercase tracking-tight text-white">{ach.title}</p>
                          <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${ach.category === 'USER' ? 'bg-blue-500/20 text-blue-400' : ach.category === 'ARTIST' ? 'bg-purple-500/20 text-purple-400' : 'bg-orange-500/20 text-orange-400'}`}>
                            {ach.category}
                          </span>
                          {ach.createdBy === 'SYSTEM' && (
                            <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-white/5 text-white/30">Platform</span>
                          )}
                        </div>
                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-0.5">{ach.description}</p>
                        <p className="text-[9px] font-black text-white/20 uppercase tracking-widest mt-0.5">Trigger: {ach.triggerType || '—'}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-2xl font-black text-white">+{ach.pointsValue || 0}</p>
                        <p className="text-[8px] font-black uppercase tracking-widest text-white/20">pts</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setEditingAch({ ...ach })}
                          className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all"
                        >
                          <Edit2 size={14} className="text-white/60" />
                        </button>
                        {ach.id && !['welcome_to_playground','first_play','first_upload'].includes(ach.id) && (
                          <button
                            onClick={async () => {
                              if (ach.id) {
                                await deactivateAchievement(ach.id);
                                setAllAchievements(prev => prev.filter(a => a.id !== ach.id));
                              }
                            }}
                            className="p-2 bg-red-500/10 hover:bg-red-500/20 rounded-xl transition-all"
                          >
                            <Trash2 size={14} className="text-red-400" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Edit / Create Modal */}
                <AnimatePresence>
                  {editingAch && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm"
                      onClick={() => setEditingAch(null)}
                    >
                      <motion.div
                        initial={{ scale: 0.95, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.95, y: 20 }}
                        onClick={e => e.stopPropagation()}
                        className="w-full max-w-lg bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] p-10 space-y-6"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-2xl bg-[#FF8C00]/20 flex items-center justify-center">
                            <Trophy size={18} className="text-[#FF8C00]" />
                          </div>
                          <h3 className="text-lg font-black uppercase tracking-widest">
                            {editingAch.id ? 'Edit Achievement' : 'New Achievement'}
                          </h3>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block mb-2">Title</label>
                            <input
                              value={editingAch.title || ''}
                              onChange={e => setEditingAch(a => ({ ...a!, title: e.target.value }))}
                              className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-white font-bold outline-none focus:ring-2 ring-[#FF8C00]/40"
                              placeholder="Achievement title..."
                            />
                          </div>
                          <div>
                            <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block mb-2">Description</label>
                            <input
                              value={editingAch.description || ''}
                              onChange={e => setEditingAch(a => ({ ...a!, description: e.target.value }))}
                              className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-white font-bold outline-none focus:ring-2 ring-[#FF8C00]/40"
                              placeholder="Short description..."
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block mb-2">Category</label>
                              <select
                                value={editingAch.category || 'USER'}
                                onChange={e => setEditingAch(a => ({ ...a!, category: e.target.value as any }))}
                                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white font-bold outline-none focus:ring-2 ring-[#FF8C00]/40"
                              >
                                <option value="USER">User</option>
                                <option value="ARTIST">Artist / Creator</option>
                                <option value="PLATFORM">Platform</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block mb-2">Points Value</label>
                              <input
                                type="number"
                                value={editingAch.pointsValue || 10}
                                onChange={e => setEditingAch(a => ({ ...a!, pointsValue: parseInt(e.target.value) || 0 }))}
                                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white font-bold outline-none focus:ring-2 ring-[#FF8C00]/40"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block mb-2">Trigger Type</label>
                            <input
                              value={editingAch.triggerType || ''}
                              onChange={e => setEditingAch(a => ({ ...a!, triggerType: (e.target.value || 'CUSTOM') as any }))}
                              className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-white font-bold outline-none focus:ring-2 ring-[#FF8C00]/40"
                              placeholder="e.g. FIRST_SIGN_IN, FIRST_UPLOAD..."
                            />
                          </div>
                          <div className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-2xl">
                            <div>
                              <p className="text-xs font-black uppercase tracking-widest text-white">Active</p>
                              <p className="text-[9px] text-white/30 font-bold">Disable to hide from users</p>
                            </div>
                            <button onClick={() => setEditingAch(a => ({ ...a!, isActive: !a?.isActive }))} className="text-white/60 hover:text-white transition-colors">
                              {editingAch.isActive ? <ToggleRight size={28} className="text-[#FF8C00]" /> : <ToggleLeft size={28} />}
                            </button>
                          </div>
                        </div>

                        <div className="flex gap-3">
                          <button onClick={() => setEditingAch(null)} className="flex-1 py-4 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all">
                            Cancel
                          </button>
                          <button
                            disabled={achSaving || !editingAch.title?.trim()}
                            onClick={async () => {
                              setAchSaving(true);
                              try {
                                if (editingAch.id) {
                                  await updateAchievement(editingAch.id, { title: editingAch.title, description: editingAch.description, category: editingAch.category as any, pointsValue: editingAch.pointsValue, triggerType: editingAch.triggerType, isActive: editingAch.isActive });
                                  setAllAchievements(prev => prev.map(a => a.id === editingAch.id ? { ...a, ...editingAch as Achievement } : a));
                                } else {
                                  const created = await createAchievement({ title: editingAch.title!, description: editingAch.description || '', category: (editingAch.category as any) || 'USER', triggerType: (editingAch.triggerType || 'CUSTOM') as any, icon: editingAch.icon || 'Trophy', pointsValue: editingAch.pointsValue || 10, isActive: true, createdBy: 'SYSTEM', requirements: { type: 'ACTION' } });
                                  if (created) setAllAchievements(prev => [...prev, created]);
                                }
                                setEditingAch(null);
                              } catch (e) { console.error(e); }
                              finally { setAchSaving(false); }
                            }}
                            className="flex-1 py-4 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest disabled:opacity-30 transition-all hover:scale-[1.02]"
                          >
                            {achSaving ? 'Saving…' : editingAch.id ? 'Save Changes' : 'Create Achievement'}
                          </button>
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {activeTab === 'ANALYTICS' && (
              <motion.div
                key="analytics"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <AdminAnalyticsDashboard />
              </motion.div>
            )}

            {activeTab === 'STAFF' && (
              <motion.div
                key="staff"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-12"
              >
                <header className="space-y-2">
                  <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Staff Accounts</h1>
                  <p className="text-white/40 text-sm font-bold uppercase tracking-widest mt-2">Manage personnel, roles, and administrative access</p>
                  <p className="text-white/40 text-sm font-bold uppercase tracking-widest">Manage administrative privileges and roles</p>
                </header>

                <div className="grid grid-cols-1 gap-4">
                  {users.filter(u => u.role === 'admin' || u.role === 'staff').map(staff => (
                    <div key={staff.uid} className="p-6 bg-white/5 border border-white/5 rounded-[2.5rem] flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <img src={staff.photoURL || null} alt="" className="w-14 h-14 rounded-2xl object-cover" />
                        <div>
                          <h4 className="font-black uppercase tracking-wider text-sm">{staff.displayName}</h4>
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${
                              staff.role === 'admin' ? 'bg-red-500/20 text-red-500' : 'bg-blue-500/20 text-blue-500'
                            }`}>
                              {staff.role}
                            </span>
                          </div>
                        </div>
                      </div>
                      <button className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all">
                        <MoreVertical size={18} className="text-white/40" />
                      </button>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'CURATED' && (
              <motion.div 
                key="curated"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-12"
              >
                <header className="space-y-2">
                  <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Curated Content</h1>
                  <p className="text-white/40 text-sm font-bold uppercase tracking-widest mt-2">Staff picks for Music, Video, and Movies & TV</p>
                </header>

                {curatedLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="animate-spin text-white/20" size={48} />
                  </div>
                ) : (
                  <div className="space-y-16">
                    {/* Music Playlists */}
                    <section className="space-y-8">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="p-3 bg-blue-500/20 rounded-2xl">
                            <Music className="text-blue-500" size={24} />
                          </div>
                          <div>
                            <h3 className="text-2xl font-black uppercase tracking-tight">Music Playlists</h3>
                            <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Select playlists to feature on the Music page</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => setIsCreatingMusic(true)}
                          className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-black uppercase tracking-widest text-[9px] rounded-full transition-all flex items-center gap-2"
                        >
                          <Plus size={14} /> Create Curated List
                        </button>
                      </div>
                      {isCreatingMusic && (
                        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-3xl overflow-y-auto">
                          <CuratedBuilder 
                            type="MUSIC"
                            onCreated={(pl) => {
                               setIsCreatingMusic(false);
                               if (!pl.isDraft) {
                                 const isCurated = systemSettings?.curatedMusicPlaylists?.includes(pl.id);
                                 if (!isCurated) handleToggleCurated('MUSIC', pl.id);
                               }
                               loadCuratedData();
                            }}
                            onCancel={() => setIsCreatingMusic(false)}
                          />
                        </div>
                      )}
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {allPlaylists.map(pl => {
                          const isCurated = systemSettings?.curatedMusicPlaylists?.includes(pl.id);
                          return (
                            <div key={pl.id} className={`p-6 rounded-3xl border transition-all ${isCurated ? 'bg-blue-500/10 border-blue-500/30' : 'bg-white/5 border-white/5'}`}>
                              <h4 className="font-bold text-sm mb-1 truncate">{pl.title} {pl.isDraft && <span className="text-small-orange text-[8px] uppercase tracking-widest ml-1">(Draft)</span>}</h4>
                              <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-4">by {pl.authorName}</p>
                              <button 
                                onClick={() => handleToggleCurated('MUSIC', pl.id)}
                                className={`w-full py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                                  isCurated ? 'bg-blue-600 text-white' : 'bg-white/10 text-white/40 hover:text-white hover:bg-white/20'
                                }`}
                              >
                                {isCurated ? 'Featured' : 'Feature Locally'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </section>

                    {/* Video Playlists */}
                    <section className="space-y-8">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="p-3 bg-red-500/20 rounded-2xl">
                            <VideoIcon className="text-red-500" size={24} />
                          </div>
                          <div>
                            <h3 className="text-2xl font-black uppercase tracking-tight">Video Playlists</h3>
                            <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Select video playlists to feature on the Video page</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => setIsCreatingVideo(true)}
                          className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-black uppercase tracking-widest text-[9px] rounded-full transition-all flex items-center gap-2"
                        >
                          <Plus size={14} /> Create Video Series
                        </button>
                      </div>
                      {isCreatingVideo && (
                        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-3xl overflow-y-auto">
                          <CuratedBuilder 
                            type="VIDEO"
                            onCreated={(pl) => {
                               setIsCreatingVideo(false);
                               if (!pl.isDraft) {
                                 const isCurated = systemSettings?.curatedVideoPlaylists?.includes(pl.id);
                                 if (!isCurated) handleToggleCurated('VIDEO', pl.id);
                               }
                               loadCuratedData();
                            }}
                            onCancel={() => setIsCreatingVideo(false)}
                          />
                        </div>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {allVideoPlaylists.map(pl => {
                          const isCurated = systemSettings?.curatedVideoPlaylists?.includes(pl.id);
                          return (
                            <div key={pl.id} className={`p-6 rounded-3xl border transition-all ${isCurated ? 'bg-red-500/10 border-red-500/30' : 'bg-white/5 border-white/5'}`}>
                              <h4 className="font-bold text-sm mb-1 truncate">{pl.title} {pl.isDraft && <span className="text-red-500 text-[8px] uppercase tracking-widest ml-1">(Draft)</span>}</h4>
                              <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-4">{pl.videoIds.length} Videos</p>
                              <button 
                                onClick={() => handleToggleCurated('VIDEO', pl.id)}
                                className={`w-full py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                                  isCurated ? 'bg-red-600 text-white' : 'bg-white/10 text-white/40 hover:text-white hover:bg-white/20'
                                }`}
                              >
                                {isCurated ? 'Featured' : 'Feature Locally'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </section>

                    {/* Must Watch Movies */}
                    <section className="space-y-8">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-purple-500/20 rounded-2xl">
                          <Monitor className="text-purple-500" size={24} />
                        </div>
                        <div>
                          <h3 className="text-2xl font-black uppercase tracking-tight">Must Watch Movies</h3>
                          <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Select movies to feature on Movies & TV pages</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {allVideos.map(v => {
                          const isCurated = systemSettings?.mustWatchMovies?.includes(v.id);
                          return (
                            <div key={v.id} className={`p-6 rounded-3xl border transition-all ${isCurated ? 'bg-purple-500/10 border-purple-500/30' : 'bg-white/5 border-white/5'}`}>
                              {v.thumbnailUrl && <img src={v.thumbnailUrl || null} className="aspect-video w-full rounded-2xl mb-4 object-cover" />}
                              <h4 className="font-bold text-sm mb-1 truncate">{v.title}</h4>
                              <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-4">{v.category || 'Video'}</p>
                              <button 
                                onClick={() => handleToggleCurated('MOVIE', v.id)}
                                className={`w-full py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                                  isCurated ? 'bg-purple-600 text-white' : 'bg-white/10 text-white/40 hover:text-white hover:bg-white/20'
                                }`}
                              >
                                {isCurated ? 'Featured' : 'Feature Locally'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'FEATURES' && (
              <motion.div 
                key="features"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-12"
              >
                <header className="space-y-2">
                  <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Feature Toggles</h1>
                  <p className="text-white/40 text-sm font-bold uppercase tracking-widest mt-2">Enable or disable system features and experiments</p>
                  <p className="text-white/40 text-sm font-bold uppercase tracking-widest">Enable or disable specific features across the platform</p>
                </header>

                <div className="p-8 bg-white/5 border border-white/5 rounded-[3rem] space-y-6">
                  <h3 className="text-xl font-black uppercase tracking-tight">External Social Feeds</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                        { key: 'xEnabled', label: 'X (Twitter) Feed' },
                        { key: 'mastodonEnabled', label: 'Mastodon Feed' },
                        { key: 'blueskyEnabled', label: 'Bluesky Feed' },
                        { key: 'threadsEnabled', label: 'Threads Feed' }
                    ].map(toggle => (
                        <div key={toggle.key} className="flex items-center justify-between p-6 bg-white/5 border border-white/5 rounded-2xl">
                          <span className="font-bold text-sm tracking-wide">{toggle.label}</span>
                          <button 
                            onClick={async () => {
                              if (!systemSettings) return;
                              const updatedSettings = {
                                ...systemSettings,
                                externalSocialLinks: {
                                  ...systemSettings.externalSocialLinks,
                                  [toggle.key]: !(systemSettings.externalSocialLinks && systemSettings.externalSocialLinks[toggle.key as keyof typeof systemSettings.externalSocialLinks])
                                }
                              };
                              await updateSystemSettingsConfig(updatedSettings);
                              setSystemSettings(updatedSettings);
                            }}
                            className={`w-14 h-8 rounded-full transition-all ${(systemSettings.externalSocialLinks && systemSettings.externalSocialLinks[toggle.key as keyof typeof systemSettings.externalSocialLinks]) ? 'bg-green-500' : 'bg-white/10'}`}
                          >
                           <div className={`w-6 h-6 bg-white rounded-full transition-transform ${(systemSettings.externalSocialLinks && systemSettings.externalSocialLinks[toggle.key as keyof typeof systemSettings.externalSocialLinks]) ? 'translate-x-7' : 'translate-x-1'}`} />
                          </button>
                        </div>
                    ))}
                  </div>
                </div>

                <div className="p-8 bg-white/5 border border-white/5 rounded-[3rem] space-y-6">
                  <h3 className="text-xl font-black uppercase tracking-tight">Apps &amp; Tools</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-6 bg-white/5 border border-white/5 rounded-2xl">
                      <div>
                        <span className="font-bold text-sm tracking-wide">Crossover Converter</span>
                        <p className="text-white/40 text-xs mt-1 normal-case tracking-normal font-normal">Standalone media converter on the app page</p>
                      </div>
                      <button
                        onClick={async () => {
                          if (!systemSettings) return;
                          const updated = { ...systemSettings, crossoverEnabled: !(systemSettings.crossoverEnabled !== false) };
                          await updateSystemSettingsConfig(updated);
                          setSystemSettings(updated);
                        }}
                        className={`w-14 h-8 rounded-full transition-all ${systemSettings?.crossoverEnabled !== false ? 'bg-green-500' : 'bg-white/10'}`}
                      >
                        <div className={`w-6 h-6 bg-white rounded-full transition-transform ${systemSettings?.crossoverEnabled !== false ? 'translate-x-7' : 'translate-x-1'}`} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between p-6 bg-white/5 border border-white/5 rounded-2xl">
                      <div>
                        <span className="font-bold text-sm tracking-wide">Content Licensing</span>
                        <p className="text-white/40 text-xs mt-1 normal-case tracking-normal font-normal">Creative-Commons licenses + Fabula music sync-licensing marketplace. ON = live for all users.</p>
                      </div>
                      <button
                        onClick={async () => {
                          const next = !contentLicensingOn;
                          setContentLicensingOn(next);
                          try { await updateFlag('CONTENT_LICENSING', { enabled: next, adminOnly: false, rolloutPercentage: 100 }, currentUser?.uid || ''); }
                          catch (e) { setContentLicensingOn(!next); console.error('[AdminDashboard] CONTENT_LICENSING toggle failed to persist:', e); alert('Could not save the licensing flag — check you have admin access and the feature-flag rule is deployed.'); }
                        }}
                        className={`w-14 h-8 rounded-full transition-all ${contentLicensingOn ? 'bg-green-500' : 'bg-white/10'}`}
                      >
                        <div className={`w-6 h-6 bg-white rounded-full transition-transform ${contentLicensingOn ? 'translate-x-7' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'MAINTENANCE' && (
              <motion.div 
                key="maintenance"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-12"
              >
                <header className="space-y-2">
                  <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Maintenance</h1>
                  <p className="text-white/40 text-sm font-bold uppercase tracking-widest mt-2">System operations, caching, and database health</p>
                  <p className="text-white/40 text-sm font-bold uppercase tracking-widest">System-wide cleanup and backfill tasks</p>
                </header>

                {/* Image optimisation backfill — retro-fits WebP derivatives onto content
                    uploaded before the pipeline existed. Dry run first: it measures the saving
                    without writing anything. Safe to stop and re-run; finished rows are skipped. */}
                <div className="p-8 bg-white/5 border border-white/5 rounded-[3rem] space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="p-4 bg-orange-500/20 rounded-2xl">
                      <Database className="text-orange-500" size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black uppercase tracking-tight">Optimise Existing Images</h3>
                      <p className="text-white/40 text-xs font-bold uppercase tracking-widest mt-1">
                        Album art was stored as lossless PNG and photos as raw camera files
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {([
                      { label: 'Dry run — covers', kind: 'albums', dry: true },
                      { label: 'Dry run — photos', kind: 'photos', dry: true },
                      { label: 'Optimise covers', kind: 'albums', dry: false },
                      { label: 'Optimise photos', kind: 'photos', dry: false },
                    ] as const).map(b => (
                      <button
                        key={b.label}
                        disabled={backfillBusy}
                        onClick={() => runImageBackfill(b.kind, b.dry)}
                        className={`px-5 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-colors disabled:opacity-40 ${
                          b.dry ? 'bg-white/8 text-white/70 hover:bg-white/12' : 'bg-orange-500 text-black hover:bg-orange-400'
                        }`}
                      >
                        {b.label}
                      </button>
                    ))}
                    {backfillBusy && (
                      <button onClick={() => { backfillStopRef.current = true; }}
                        className="px-5 py-3 rounded-2xl bg-red-500/20 text-red-300 text-[11px] font-black uppercase tracking-widest hover:bg-red-500/30 transition-colors">
                        Stop
                      </button>
                    )}
                  </div>

                  {!!backfillLog.length && (
                    <div className="max-h-56 overflow-y-auto rounded-2xl bg-black/40 border border-white/5 p-4 font-mono text-[11px] text-white/50 space-y-1">
                      {backfillLog.map((l, i) => <div key={i}>{l}</div>)}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="p-8 bg-white/5 border border-white/5 rounded-[3rem] space-y-6">
                    <div className="flex items-center gap-4">
                      <div className="p-4 bg-purple-500/20 rounded-2xl">
                        <Database className="text-purple-500" size={24} />
                      </div>
                      <div>
                        <h3 className="text-xl font-black uppercase tracking-tight">Migrate Posts to Feed</h3>
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Copy old Interstellar posts into Plajah Social Feed</p>
                      </div>
                    </div>
                    <button 
                      onClick={handleMigratePosts}
                      disabled={isBackfilling}
                      className="w-full py-4 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl flex items-center justify-center gap-2"
                    >
                      {isBackfilling ? <Loader2 className="animate-spin" size={16} /> : <Database size={16} />}
                      {isBackfilling ? 'Migrating...' : 'Start Migration'}
                    </button>
                  </div>
                  
                  <div className="p-8 bg-white/5 border border-white/5 rounded-[3rem] space-y-6">
                    <div className="flex items-center gap-4">
                      <div className="p-4 bg-orange-500/20 rounded-2xl">
                        <Notebook className="text-orange-500" size={24} />
                      </div>
                      <div>
                        <h3 className="text-xl font-black uppercase tracking-tight">Generate Missing Liner Notes</h3>
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Backfill descriptions for all public albums using AI</p>
                      </div>
                    </div>
                    
                    {backfillResult && (
                      <div className={`p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest ${
                        backfillResult.includes('failed') ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'
                      }`}>
                        {backfillResult}
                      </div>
                    )}

                    <button 
                      onClick={handleBackfillLinerNotes}
                      disabled={isBackfilling}
                      className="w-full py-4 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl flex items-center justify-center gap-2"
                    >
                      {isBackfilling ? <Loader2 className="animate-spin" size={16} /> : <Zap size={16} />}
                      {isBackfilling ? 'Processing Albums...' : 'Start Backfill Notes'}
                    </button>
                  </div>

                  <div className="p-8 bg-white/5 border border-white/5 rounded-[3rem] space-y-6">
                    <div className="flex items-center gap-4">
                      <div className="p-4 bg-blue-500/20 rounded-2xl">
                        <Activity className="text-blue-500" size={24} />
                      </div>
                      <div>
                        <h3 className="text-xl font-black uppercase tracking-tight">Generate Missing Lyrics</h3>
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Backfill lyrics for all tracks using AI</p>
                      </div>
                    </div>
                    
                    <button 
                      onClick={handleBackfillLyrics}
                      disabled={isBackfilling}
                      className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl flex items-center justify-center gap-2"
                    >
                      {isBackfilling ? <Loader2 className="animate-spin" size={16} /> : <Activity size={16} />}
                      {isBackfilling ? 'Processing Lyrics...' : 'Start Backfill Lyrics'}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Library Modal */}
      <AnimatePresence>
        {showLibraryModal && editingGlobalItem && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLibraryModal(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-[#080808] border border-white/10 rounded-[3rem] p-10 lg:p-16 max-h-[90vh] overflow-y-auto"
            >
              <h2 className="text-4xl font-black uppercase tracking-tightest mb-4">
                {editingGlobalItem.id ? 'Edit Archive Item' : 'New Archive Item'}
              </h2>
              <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.3em] mb-12">Global Managed Content</p>

              <form onSubmit={handleSaveGlobalItem} className="space-y-8">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-white/40 ml-4">Content Type</label>
                    <select 
                      value={editingGlobalItem.type}
                      onChange={(e) => setEditingGlobalItem({...editingGlobalItem, type: e.target.value as any})}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-xs font-black uppercase tracking-widest outline-none focus:border-white/30"
                    >
                      <option value="BOOK">Book / Novel</option>
                      <option value="MUSIC">Music / Audio</option>
                      <option value="VIDEO">Video / Visual</option>
                      <option value="PHOTO">Photo / Gallery</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-white/40 ml-4">Sub-Type</label>
                    <select 
                      value={editingGlobalItem.subType}
                      onChange={(e) => setEditingGlobalItem({...editingGlobalItem, subType: e.target.value as any})}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-xs font-black uppercase tracking-widest outline-none focus:border-white/30"
                    >
                      <option value="">Standard</option>
                      <option value="MOVIE">Movie</option>
                      <option value="TV_SERIES">TV Series</option>
                      <option value="GRAPHIC_NOVEL">Graphic Novel</option>
                      <option value="PODCAST">Podcast</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/40 ml-4">Asset Title</label>
                  <input 
                    type="text"
                    required
                    value={editingGlobalItem.title || ''}
                    onChange={(e) => setEditingGlobalItem({...editingGlobalItem, title: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-xs font-black uppercase tracking-widest outline-none focus:border-white/30"
                    placeholder="e.g. Frankenstein (1818)"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/40 ml-4">Artist / Author</label>
                  <input 
                    type="text"
                    required
                    value={editingGlobalItem.artist || ''}
                    onChange={(e) => setEditingGlobalItem({...editingGlobalItem, artist: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-xs font-black uppercase tracking-widest outline-none focus:border-white/30"
                    placeholder="Public Domain / Author Name"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/40 ml-4">Cover Image URL</label>
                  <input 
                    type="text"
                    required
                    value={editingGlobalItem.coverImage || ''}
                    onChange={(e) => setEditingGlobalItem({...editingGlobalItem, coverImage: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-xs font-bold outline-none focus:border-white/30"
                    placeholder="https://..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/40 ml-4">Description</label>
                  <textarea 
                    value={editingGlobalItem.description || ''}
                    onChange={(e) => setEditingGlobalItem({...editingGlobalItem, description: e.target.value})}
                    rows={4}
                    className="w-full bg-white/5 border border-white/10 rounded-3xl p-6 text-xs font-bold leading-relaxed outline-none focus:border-white/30 resize-none"
                    placeholder="Historical context or plot summary..."
                  />
                </div>

                <div className="flex gap-4 pt-6">
                  <button 
                    type="button"
                    onClick={() => setShowLibraryModal(false)}
                    className="flex-1 py-4 bg-white/5 hover:bg-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl hover:scale-105"
                  >
                    Save to Archive
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Ad Modal */}
      <AnimatePresence>
        {showAdModal && editingAd && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAdModal(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-xl bg-[#0a0a0a] border border-white/10 rounded-[3rem] p-12 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-red-600 to-orange-600" />
              
              <h2 className="text-3xl font-black uppercase tracking-tight mb-8">
                {editingAd.id ? 'Edit Campaign' : 'New Campaign'}
              </h2>

              <form onSubmit={handleSaveAd} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">Campaign Title</label>
                  <input 
                    type="text"
                    required
                    value={editingAd.title || ''}
                    onChange={(e) => setEditingAd({ ...editingAd, title: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold outline-none focus:border-red-500 transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">Placement</label>
                    <select 
                      value={editingAd.placement || 'BANNER'}
                      onChange={(e) => setEditingAd({ ...editingAd, placement: e.target.value as any })}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold outline-none appearance-none"
                    >
                      <option value="BANNER">Global Banner</option>
                      <option value="SIDEBAR">Sidebar Ad</option>
                      <option value="FEED">Feed Injection</option>
                      <option value="PLAYER">Player Overlay</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">Status</label>
                    <select 
                      value={editingAd.isActive ? 'true' : 'false'}
                      onChange={(e) => setEditingAd({ ...editingAd, isActive: e.target.value === 'true' })}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold outline-none appearance-none"
                    >
                      <option value="true">Active</option>
                      <option value="false">Paused</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">Image URL</label>
                  <input 
                    type="text"
                    value={editingAd.imageUrl || ''}
                    onChange={(e) => setEditingAd({ ...editingAd, imageUrl: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold outline-none focus:border-red-500 transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">Target URL</label>
                  <input 
                    type="text"
                    value={editingAd.linkUrl || ''}
                    onChange={(e) => setEditingAd({ ...editingAd, linkUrl: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold outline-none focus:border-red-500 transition-all"
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setShowAdModal(false)}
                    className="flex-1 py-4 bg-white/5 hover:bg-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl"
                  >
                    Save Campaign
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Theme Background Modal */}
      <AnimatePresence>
        {showThemeModal && editingThemeBg && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowThemeModal(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-4xl bg-[#0a0a0a] border border-white/10 rounded-[3rem] p-12 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-600 to-purple-600" />
              
              <h2 className="text-3xl font-black uppercase tracking-tight mb-8">
                {editingThemeBg.id ? 'Edit Background' : 'New Theme Background'}
              </h2>

              <form onSubmit={handleSaveThemeBg} className="space-y-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">Background Name</label>
                      <input 
                        type="text"
                        required
                        placeholder="e.g., Vintage Newspaper, Modern Vinyl"
                        value={editingThemeBg.name || ''}
                        onChange={(e) => setEditingThemeBg({ ...editingThemeBg, name: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold outline-none focus:border-blue-500 transition-all"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">Theme Type</label>
                      <select 
                        value={editingThemeBg.theme || 'SCRAPBOOK'}
                        onChange={(e) => setEditingThemeBg({ ...editingThemeBg, theme: e.target.value as any })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold outline-none appearance-none"
                      >
                        <option value="SCRAPBOOK">Scrapbook</option>
                        <option value="PHOTO_ALBUM">Photo Album</option>
                        <option value="MUSIC_PLAYER">Music Player</option>
                        <option value="NEWSPAPER">Newspaper</option>
                        <option value="ARCADE">Arcade</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">Background Image</label>
                      <div className="space-y-4">
                        <input 
                          type="text"
                          placeholder="Image URL"
                          value={editingThemeBg.imageUrl || ''}
                          onChange={(e) => setEditingThemeBg({ ...editingThemeBg, imageUrl: e.target.value })}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold outline-none focus:border-blue-500 transition-all"
                        />
                        <div className="flex items-center gap-4">
                          <FileUploader 
                            type="PHOTO"
                            onUploadComplete={handleAnalyzeBackground}
                            label={isAnalyzing ? "Analyzing..." : "Upload & Analyze with AI"}
                          />
                          {isAnalyzing && <Loader2 className="animate-spin text-blue-500" size={20} />}
                        </div>
                      </div>
                    </div>

                    <div className="pt-8 flex gap-4">
                      <button 
                        type="button"
                        onClick={() => setShowThemeModal(false)}
                        className="flex-1 py-4 bg-white/5 hover:bg-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                      >
                        Cancel
                      </button>
                      <button 
                        type="submit"
                        disabled={isAnalyzing || !editingThemeBg.imageUrl}
                        className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl disabled:opacity-50"
                      >
                        Save Background
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">Interactive Zones Preview</label>
                    <div className="aspect-video bg-black rounded-3xl border border-white/10 relative overflow-hidden group">
                      {editingThemeBg.imageUrl ? (
                        <>
                          <img src={editingThemeBg.imageUrl || null} className="w-full h-full object-cover opacity-50" alt="" />
                          {editingThemeBg.zones?.map((zone) => (
                            <div 
                              key={zone.id}
                              className="absolute border-2 border-blue-500 bg-blue-500/20 flex items-center justify-center group/zone"
                              style={{
                                left: `${zone.x}%`,
                                top: `${zone.y}%`,
                                width: `${zone.width}%`,
                                height: `${zone.height}%`,
                                transform: `rotate(${zone.rotation || 0}deg)`
                              }}
                            >
                              <span className="text-[8px] font-black text-white bg-blue-600 px-1 rounded uppercase">{zone.type}</span>
                            </div>
                          ))}
                        </>
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-white/20">
                          <ImageIcon size={48} className="mb-4" />
                          <p className="text-[10px] font-black uppercase tracking-widest">No Background Uploaded</p>
                        </div>
                      )}
                    </div>
                    <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest leading-relaxed">
                      AI will automatically detect where user content should be placed. You can re-upload to re-analyze if the zones aren't perfect.
                    </p>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {showUniverseModal && editingUniverse && (
          <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-8">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-[#121212] p-8 rounded-3xl w-full max-w-lg border border-white/10 space-y-6">
              <h2 className="text-2xl font-black uppercase">{editingUniverse.id ? 'Edit Universe' : 'Create Universe'}</h2>
              <form onSubmit={handleSaveUniverse} className="space-y-4">
                <input type="text" placeholder="Name" value={editingUniverse.name || ''} onChange={e => setEditingUniverse({...editingUniverse, name: e.target.value})} className="w-full bg-white/5 p-4 rounded-xl" />
                <select value={editingUniverse.type} onChange={e => setEditingUniverse({...editingUniverse, type: e.target.value as any})} className="w-full bg-white/5 p-4 rounded-xl">
                  <option value="ON_PLATFORM">On Platform</option>
                  <option value="ALLY">Ally</option>
                </select>
                {editingUniverse.type === 'ALLY' && (
                  <input type="text" placeholder="External URL" value={editingUniverse.url || ''} onChange={e => setEditingUniverse({...editingUniverse, url: e.target.value})} className="w-full bg-white/5 p-4 rounded-xl" />
                )}
                <input type="text" placeholder="Description" value={editingUniverse.description || ''} onChange={e => setEditingUniverse({...editingUniverse, description: e.target.value})} className="w-full bg-white/5 p-4 rounded-xl" />
                <div className="space-y-2">
                  <p className="text-white/40 text-[10px] font-black uppercase">Cover Image</p>
                  <input type="text" placeholder="Cover Image URL" value={editingUniverse.coverImage || ''} onChange={e => setEditingUniverse({...editingUniverse, coverImage: e.target.value})} className="w-full bg-white/5 p-4 rounded-xl" />
                  <input type="file" accept="image/*" onChange={e => setCoverFile(e.target.files?.[0] || null)} className="w-full bg-white/5 p-4 rounded-xl" />
                </div>
                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setShowUniverseModal(false)} className="flex-1 py-4 bg-white/5 rounded-xl hover:bg-white/10 transition-all">Cancel</button>
                  <button type="submit" className="flex-1 py-4 bg-white text-black rounded-xl hover:scale-[1.02] transition-all">Save</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
    </div>
  );
};

export default AdminDashboard;
