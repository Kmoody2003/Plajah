import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Album, Track, Video, VideoPlaylist, BookChapter, MovieMetadata, TVSeason, CastMember, ProductionCredit, FilmDistribution, FilmVersion, Character } from '../types';
import { getPlatformInfo } from '../hooks/usePlatform';
import { buildShareUrl, shareText } from '../services/deepLinkService';
import { generateAlbumMetadata, generateTrackLyrics } from '../services/geminiService';
import { publishToCloud, auth, fetchAllPublicAlbums, fetchUserWorlds, createIPWorld, addAssetToWorld, addCharactersToWorld, createCharacter, fetchUserCharacters, uploadFile as storageUpload, uploadVideo, fetchUserVideos } from '../services/backendService';
import { listCloudProjects } from './plajahPixels/services/projectService';
import { enqueueTranscode } from '../services/choraStreamService';
// Lyric sync lives in ONE place (services/lyricSync.ts) so the Melos Project view and this
// Caption Sync card can never drift apart.
import {
  lyricLinesFor as sharedLyricLinesFor,
  transcriptionToText,
  reconcileTimedLyricText as sharedReconcile,
  timedLyricDrift as sharedDrift,
  applyLyricsToTimings as sharedApplyLyrics,
  nudgeLyricTime as sharedNudge,
  setLyricTime as sharedSetTime,
} from '../services/lyricSync';
import { captureVideoFrame } from '../src/lib/videoUtils';
import { probeVideo } from '../src/lib/videoQc';
import {
  Upload, X, Image as ImageIcon, User, Sparkles, Globe, Video as VideoIcon, List, Plus, Trash2,
  Camera, Film, Tv, Info, Check, Layers, Settings, Twitter, Instagram, Youtube, Music2, Radio,
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Minimize2, BookOpen, Gamepad2, Mic2, GripVertical,
  Eye, EyeOff, Loader2, Lock, Pencil, ExternalLink, Share2,
  RefreshCw, Play, Pause, Square, SkipBack, ShieldCheck, AlertTriangle, ShieldX, Heart, Megaphone,
} from 'lucide-react';
import { useUpload } from '../contexts/UploadContext';
import { usePublishQueue } from '../contexts/PublishQueueContext';
import EarlyAccessManager from './EarlyAccessManager';
import FilmDistributionStep, { DEFAULT_FILM_DISTRIBUTION } from './FilmDistributionStep';
import FilmVersionsManager from './FilmVersionsManager';
import LicensePicker from './LicensePicker';
import { isFeatureEnabled } from '../services/featureFlagService';
import { DEFAULT_LICENSE, type ContentLicenseId } from '../services/licensingService';
import type { RegistrySubject } from '../services/registry/registryService';
// Opt-in registry layer — off for every account until the owner turns it on.
const RightsIdentifiersPanel = lazy(() => import('./registry/RightsIdentifiersPanel'));
const SamplingRightsPanel = lazy(() => import('./melos/sampling/SamplingRightsPanel').then((m) => ({ default: m.SamplingRightsPanel })));
// Project Promo — the promo-kit folder (specs + assets for every promotion surface).
const ProjectPromoManager = lazy(() => import('./ProjectPromoManager'));
import { AUDIO_ACCEPT } from '../services/audioFormatService';
import AudioHealthPanel from './AudioHealthPanel';

interface AlbumCreatorProps {
  onCreated: (album: Album) => void;
  onCancel: () => void;
  onMinimize?: () => void;
  isMinimized?: boolean;
  initialAlbum?: Album;
  initialType?: AssetType;
}

type AssetType = 'MUSIC' | 'VIDEO' | 'BOOK' | 'PHOTO' | 'GAME';

const TYPE_OPTIONS: { id: AssetType; label: string; desc: string; icon: React.ReactNode }[] = [
  { id: 'MUSIC', label: 'Music', desc: 'Albums, EPs, singles & podcasts', icon: <Music2 size={32} /> },
  { id: 'VIDEO', label: 'Video', desc: 'Films, series & video content', icon: <Film size={32} /> },
  { id: 'BOOK', label: 'Books', desc: 'Novels, comics & graphic novels', icon: <BookOpen size={32} /> },
  { id: 'PHOTO', label: 'Photos', desc: 'Photo galleries & collections', icon: <ImageIcon size={32} /> },
  { id: 'GAME', label: 'Games', desc: 'Indie games & interactive media', icon: <Gamepad2 size={32} /> },
];

const MUSIC_SUBTYPES = ['ALBUM', 'SINGLE', 'EP', 'MIX', 'PODCAST'] as const;
const VIDEO_SUBTYPES = ['UGC', 'MOVIE', 'TV_SERIES', 'PODCAST'] as const;

// Professional film/TV upload accept list. `video/*` alone hides pro masters
// because .mxf/.mts/.m2ts/.mov (ProRes/DNxHD) often have no OS-registered MIME —
// so filmmakers couldn't even select them. This covers the full set of container
// formats Mux ingests + transcodes. (Camera-raw / image-sequence formats like
// DPX, R3D, BRAW, EXR are NOT streamable by Mux — if one is chosen the upload
// still stores it under the account, but export a ProRes/H.264 master for playback.)
const VIDEO_ACCEPT = 'video/*,.mp4,.m4v,.mov,.qt,.mkv,.webm,.avi,.wmv,.flv,.ts,.m2ts,.mts,.mpg,.mpeg,.m2v,.3gp,.3g2,.ogv,.mxf,.gxf,.vob,.asf,.f4v,.divx';

// Step labels are computed dynamically in the component based on type + subType.

const hasSubtype = (t: AssetType) => t === 'MUSIC' || t === 'VIDEO';

const AlbumCreator: React.FC<AlbumCreatorProps> = ({ onCreated, onCancel, onMinimize, isMinimized, initialAlbum, initialType }) => {
  const resolvedInitialType: AssetType = (initialAlbum?.type as AssetType) || initialType || 'MUSIC';
  const [step, setStep] = useState(initialAlbum ? 3 : initialType ? 1 : 0);
  // Project Promo mode — the promo-kit folder, opened from the step-0 category grid.
  const [promoMode, setPromoMode] = useState(false);
  const [title, setTitle] = useState(initialAlbum?.title || '');
  const [artist, setArtist] = useState(initialAlbum?.artist || '');
  const [type, setType] = useState<AssetType>(resolvedInitialType);
  const [subType, setSubType] = useState<'UGC' | 'MOVIE' | 'TV_SERIES' | 'GRAPHIC_NOVEL' | 'PODCAST' | 'NOVEL' | 'PLAYLIST' | 'MIX' | undefined>(initialAlbum?.subType);
  // ── Chora Mixes (subType 'MIX') settings, surfaced in the Settings step ──
  const [mixVisualMode, setMixVisualMode] = useState<'AUTO' | 'AUTHORED'>(initialAlbum?.mixMeta?.visualMode || 'AUTO');
  const [mixPixelsProjectId, setMixPixelsProjectId] = useState<string>(initialAlbum?.mixMeta?.pixelsProjectId || '');
  const [mixAllowComments, setMixAllowComments] = useState<boolean>(initialAlbum?.mixMeta?.allowComments !== false);
  const [mixPixelsProjects, setMixPixelsProjects] = useState<{ id: string; projectName: string }[]>([]);
  // Mix audio source: UPLOAD (default), REELLO (pull from one of the artist's videos), or
  // DJ_MODE (seeded from a captured set). Reello picker state.
  const [mixSourceKind, setMixSourceKind] = useState<'UPLOAD' | 'REELLO' | 'DJ_MODE'>(initialAlbum?.mixMeta?.source || 'UPLOAD');
  const [mixSourceVideoId, setMixSourceVideoId] = useState<string>(initialAlbum?.mixMeta?.sourceVideoId || '');
  const [mixReelloVideos, setMixReelloVideos] = useState<Video[]>([]);
  const [mixReelloOpen, setMixReelloOpen] = useState(false);
  const [mixReelloLoading, setMixReelloLoading] = useState(false);
  // Film/TV distribution + release (folded in from the old Distribute-New-Film wizard).
  const [filmDist, setFilmDist] = useState<FilmDistribution>(initialAlbum?.filmDistribution || DEFAULT_FILM_DISTRIBUTION);
  const [alternateVersions, setAlternateVersions] = useState<FilmVersion[]>(initialAlbum?.alternateVersions || []);
  const saveAsDraftRef = useRef(false);
  // Save Now + unsaved-changes guard. projectIdRef is stable across saves so repeated
  // "Save Now" on a NEW project updates the same draft instead of creating duplicates.
  const keepOpenAfterSaveRef = useRef(false);
  const quietSaveRef = useRef(false); // autosave: save silently, no overlay/QC/alerts
  const projectIdRef = useRef<string>(initialAlbum?.id || `album_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const [savedFlash, setSavedFlash] = useState(false);
  const [autosaveState, setAutosaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [isDirty, setIsDirty] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [genre, setGenre] = useState(initialAlbum?.genre || '');
  const [price, setPrice] = useState<number>(initialAlbum?.price || 0);
  const [isPaywalled, setIsPaywalled] = useState<boolean>(initialAlbum?.isPaywalled || false);
  // Content licensing (built but OFF — gated behind CONTENT_LICENSING flag).
  const [license, setLicense] = useState<string>(initialAlbum?.license || DEFAULT_LICENSE);
  const licensingEnabled = isFeatureEnabled('CONTENT_LICENSING', auth.currentUser?.uid || '', auth.currentUser?.email === 'kmoody2003@gmail.com');
  const [artistBio, setArtistBio] = useState(initialAlbum?.artistBio || '');
  const [linerNotes, setLinerNotes] = useState(initialAlbum?.linerNotes || '');
  const [trackListLabel, setTrackListLabel] = useState(initialAlbum?.trackListLabel || '');
  const [artistImage, setArtistImage] = useState<string | undefined>(initialAlbum?.artistImage || undefined);
  const [artistFile, setArtistFile] = useState<File | undefined>(undefined);
  // Artist persona = a Worlds Character. Releasing under a character keeps the artist
  // identity independent of the account display name but attached to the user's IP.
  const [artistCharacterId, setArtistCharacterId] = useState<string | undefined>(initialAlbum?.artistCharacterId);
  const [artistWorldId, setArtistWorldId] = useState<string | undefined>(initialAlbum?.artistWorldId);
  const [personaOptions, setPersonaOptions] = useState<Character[]>([]);
  useEffect(() => {
    const u = auth.currentUser?.uid;
    if (!u) return;
    fetchUserCharacters(u).then(setPersonaOptions).catch(() => {});
  }, []);
  const applyPersona = (c: Character | null) => {
    if (!c) { setArtistCharacterId(undefined); setArtistWorldId(undefined); return; }
    setArtistCharacterId(c.id);
    setArtistWorldId(c.worldId);
    setArtist(c.name);
    if (c.imageUrl) setArtistImage(c.imageUrl);
    if (c.bio && !artistBio) setArtistBio(c.bio);
  };
  const [tracks, setTracks] = useState<Track[]>(() => {
    const t = initialAlbum?.tracks || [];
    // Recover uploaded videos on edit: a VIDEO album's tracks are videos, so
    // backfill mediaKind (older entries never stored it) — this restores the
    // video preview + video QC instead of treating them as audio rows.
    if (initialAlbum?.type === 'VIDEO') {
      return t.map(x => ({ ...x, mediaKind: x.mediaKind || ('VIDEO' as const) }));
    }
    return t;
  });
  // Set when a camera-raw / image-sequence file (DPX/R3D/BRAW/EXR/ARRIRAW) is
  // chosen — Mux can't stream those, so we warn the filmmaker to export a master.
  const [rawFormatNote, setRawFormatNote] = useState<string | null>(null);
  const [coverImage, setCoverImage] = useState(initialAlbum?.coverImage || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=1000&auto=format&fit=crop');
  const [coverFile, setCoverFile] = useState<File | undefined>(undefined);
  const [slideshow, setSlideshow] = useState<string[]>(initialAlbum?.slideshow || []);
  const [slideshowFiles, setSlideshowFiles] = useState<File[]>([]);
  const [bookChapters, setBookChapters] = useState<BookChapter[]>(initialAlbum?.bookChapters || []);
  const [bookPreviewConfig, setBookPreviewConfig] = useState(initialAlbum?.bookPreviewConfig || { type: 'PAGES' as const, allowedPageRange: [1, 5] as [number, number] });
  const [allowPageSharing, setAllowPageSharing] = useState(initialAlbum?.allowPageSharing || false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [rightsConfirmed, setRightsConfirmed] = useState(!!initialAlbum);
  const [status, setStatus] = useState({ text: '', percent: 0 });
  const [galleryUrl, setGalleryUrl] = useState(initialAlbum?.galleryUrl || '');
  const [socialLinks, setSocialLinks] = useState(initialAlbum?.socialLinks || { twitter: '', instagram: '', spotify: '', youtube: '', website: '' });
  const [musicVideos, setMusicVideos] = useState<Video[]>(initialAlbum?.musicVideos || []);
  const [videoPlaylists, setVideoPlaylists] = useState<VideoPlaylist[]>(initialAlbum?.videoPlaylists || []);
  const [liveFeedUrl, setLiveFeedUrl] = useState(initialAlbum?.liveFeedUrl || '');
  const [donationGoal, setDonationGoal] = useState<number>(initialAlbum?.donationGoal || 0);
  const [isPrivate, setIsPrivate] = useState<boolean>(initialAlbum?.isPrivate || false);
  const [isIntimateOnly, setIsIntimateOnly] = useState<boolean>(initialAlbum?.isIntimateOnly || false);
  const [isDraft, setIsDraft] = useState<boolean>(initialAlbum?.isDraft ?? false);
  const [tags, setTags] = useState<string[]>(initialAlbum?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [isScheduled, setIsScheduled] = useState<boolean>(initialAlbum?.isScheduled || false);
  const [isSlideshowEnabled, setIsSlideshowEnabled] = useState<boolean>(initialAlbum?.isSlideshowEnabled || false);
  const [releaseDate, setReleaseDate] = useState<string>(initialAlbum?.releaseDate ? new Date(initialAlbum.releaseDate).toISOString().slice(0, 16) : '');
  const [publishVideosToGallery, setPublishVideosToGallery] = useState<boolean>(initialAlbum?.publishVideosToGallery ?? true);
  const [newVideoTitle, setNewVideoTitle] = useState('');
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [newVideoFile, setNewVideoFile] = useState<File | undefined>(undefined);
  const [newVideoThumb, setNewVideoThumb] = useState<File | undefined>(undefined);
  const [newVideoCover, setNewVideoCover] = useState<File | undefined>(undefined);
  const [isCapturing, setIsCapturing] = useState(false);
  const detectMobile = () =>
    window.matchMedia('(pointer: coarse)').matches ||
    (!getPlatformInfo().isTV && /Mobi|Android|iPhone|iPad|iPod|IEMobile/i.test(navigator.userAgent)) ||
    window.innerWidth < 1024;
  const [isMobile, setIsMobile] = useState(detectMobile);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState('');
  const [contentTab, setContentTab] = useState<'tracks' | 'audio_health' | 'videos' | 'quality'>('tracks');
  const [seasons, setSeasons] = useState<TVSeason[]>(initialAlbum?.seasons || []);
  const [relatedProjectIds, setRelatedProjectIds] = useState<string[]>(initialAlbum?.relatedProjectIds || []);
  const [publishToAudius, setPublishToAudius] = useState<boolean>(initialAlbum?.publishToAudius ?? false);
  // Which thing the Rights & Identifiers panel is open on: the release (UPC, catalogue
  // number) or one track (ISRC, ISWC). Null = closed.
  const [rightsSubject, setRightsSubject] = useState<RegistrySubject | null>(null);
  const [samplingSubject, setSamplingSubject] = useState<import('./melos/sampling/SamplingRightsPanel').SamplingSubject | null>(null);
  const [samplingOn, setSamplingOn] = useState(false);
  // Fresh-on-Plajah strip shown while the upload deploys.
  const [recentAdditions, setRecentAdditions] = useState<Album[]>([]);
  const [availableAlbums, setAvailableAlbums] = useState<Album[]>([]);
  const [movieMetadata, setMovieMetadata] = useState<MovieMetadata>(initialAlbum?.movieMetadata || {
    cast: [], crew: [], trailerUrl: '', releaseYear: new Date().getFullYear(), specialFeatures: []
  });

  // World & universe state
  const [worldAssignment, setWorldAssignment] = useState<'NEW' | 'EXISTING' | 'STANDALONE'>(initialAlbum?.worldId ? 'EXISTING' : 'STANDALONE');
  const [worldId, setWorldId] = useState<string | undefined>(initialAlbum?.worldId);
  const [newWorldName, setNewWorldName] = useState('');
  const [availableWorlds, setAvailableWorlds] = useState<{ id: string; name: string; coverImage?: string }[]>([]);

  // Characters (draft — created in Firestore on publish)
  const [draftCharacters, setDraftCharacters] = useState<{ id: string; name: string; role: string }[]>([]);
  const [newCharName, setNewCharName] = useState('');
  const [newCharRole, setNewCharRole] = useState('');

  // Game-specific fields
  const [gameUrl, setGameUrl] = useState(initialAlbum?.gameUrl || '');
  const [gameVideoUrl, setGameVideoUrl] = useState(initialAlbum?.gameVideoUrl || '');
  const [gameScreenshots, setGameScreenshots] = useState<string[]>(initialAlbum?.gameScreenshots || []);
  const [gameFeatures, setGameFeatures] = useState<Record<string, boolean>>(initialAlbum?.gameFeatures || {});
  const GAME_FEATURES = [
    { key: 'controllerSupport', label: 'Controller Support' },
    { key: 'keyboardMouse', label: 'Keyboard & Mouse' },
    { key: 'touchControls', label: 'Touch Controls' },
    { key: 'mobileOptimized', label: 'Mobile Optimized' },
    { key: 'multiplayer', label: 'Multiplayer' },
    { key: 'localMultiplayer', label: 'Local Multiplayer' },
    { key: 'onlineMultiplayer', label: 'Online Multiplayer' },
    { key: 'coop', label: 'Co-op Mode' },
    { key: 'pvp', label: 'PvP Mode' },
    { key: 'xrVr', label: 'XR / VR' },
    { key: 'achievements', label: 'Achievements' },
    { key: 'leaderboards', label: 'Leaderboards' },
    { key: 'freeToPlay', label: 'Free to Play' },
    { key: 'crossPlatform', label: 'Cross-Platform' },
  ];

  // Hide N Seek configuration
  const [hnsEnabled, setHnsEnabled] = useState<boolean>(initialAlbum?.hideNSeekConfig?.isEnabled || false);
  const [hnsGlobalMode, setHnsGlobalMode] = useState<boolean>(initialAlbum?.hideNSeekConfig?.globalEnabled || false);
  const [hnsWindows, setHnsWindows] = useState(initialAlbum?.hideNSeekConfig?.windows || []);
  const [hnsNewTime, setHnsNewTime] = useState('12:00');
  const [hnsNewEndTime, setHnsNewEndTime] = useState('23:59');
  const [hnsNewDays, setHnsNewDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [hnsTrackConfigs, setHnsTrackConfigs] = useState(initialAlbum?.hideNSeekConfig?.trackConfigs || []);
  const [hnsSlotUploading, setHnsSlotUploading] = useState<string | null>(null);
  const [hnsSlotProgress, setHnsSlotProgress] = useState<Record<string, number>>({});
  const [hnsSlotSaved, setHnsSlotSaved] = useState<string | null>(null);
  // Track-as-slot assignment (new feature)
  const [hnsTrackPicker, setHnsTrackPicker] = useState<{ trackId: string; slot: 1 | 2 } | null>(null);
  const [hnsSlotsDirty, setHnsSlotsDirty] = useState(false);
  const [hnsScheduleSaved, setHnsScheduleSaved] = useState(false);

  // Cast & production credits (Movie / TV)
  const [castMembers, setCastMembers] = useState<CastMember[]>(initialAlbum?.movieMetadata?.castMembers || []);
  const [productionCredits, setProductionCredits] = useState<ProductionCredit[]>(initialAlbum?.movieMetadata?.productionCredits || []);
  const [newCastActor, setNewCastActor] = useState('');
  const [newCastChar, setNewCastChar] = useState('');
  const [newCastRole, setNewCastRole] = useState('Lead');
  const [newCredName, setNewCredName] = useState('');
  const [newCredRole, setNewCredRole] = useState('');
  const [newCredDept, setNewCredDept] = useState('Directing');

  const { uploadFile } = useUpload();
  const { enqueue } = usePublishQueue();

  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Track preview + QC
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  type QcStatus = 'idle' | 'running' | 'pass' | 'warn' | 'fail';
  type TrackQcResult = { status: QcStatus; duration?: number; peak?: number; rms?: number; issue?: string; width?: number; height?: number; kind?: 'AUDIO' | 'VIDEO' };
  const [qcResults, setQcResults] = useState<Record<string, TrackQcResult>>({});
  const [isQcRunning, setIsQcRunning] = useState(false);
  // Inline video preview (playback) in the tracks list.
  const [previewVideoId, setPreviewVideoId] = useState<string | null>(null);

  // Tap-to-sync
  const [tapSyncTrackId, setTapSyncTrackId] = useState<string | null>(null);
  const tapAudioRef = useRef<HTMLAudioElement | null>(null);
  const [tapCurrentLine, setTapCurrentLine] = useState(0);
  const [tapTimes, setTapTimes] = useState<number[]>([]);
  const [tapIsPlaying, setTapIsPlaying] = useState(false);
  const [tapCurrentTime, setTapCurrentTime] = useState(0);
  const [tapDuration, setTapDuration] = useState(0);
  const tapRafRef = useRef<number | null>(null);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const handleResize = () => { clearTimeout(t); t = setTimeout(() => setIsMobile(detectMobile()), 150); };
    window.addEventListener('resize', handleResize, { passive: true });
    // Real recent uploads platform-wide (sorted newest-first), not the curated
    // public-domain Global Archive — so the strip shows genuine fresh additions.
    fetchAllPublicAlbums().then(items => setRecentAdditions((items || []).filter(a => a.coverImage).slice(0, 12))).catch(() => {});
    return () => { window.removeEventListener('resize', handleResize); clearTimeout(t); };
  }, []);

  useEffect(() => {
    const loadAvailable = async () => {
      try {
        const all = await fetchAllPublicAlbums();
        setAvailableAlbums(all.filter(a => a.ownerId === auth.currentUser?.uid && a.id !== initialAlbum?.id));
      } catch (err) { console.error("Failed to load available albums:", err); }
    };
    loadAvailable();
  }, [initialAlbum?.id]);

  // Load the artist's saved Plajah Pixels projects for the Mix "Author's show" picker.
  useEffect(() => {
    if (subType !== 'MIX' || mixVisualMode !== 'AUTHORED' || !auth.currentUser) return;
    if (mixPixelsProjects.length) return;
    listCloudProjects(auth.currentUser.uid)
      .then(list => setMixPixelsProjects((list || []).map(p => ({ id: p.id, projectName: p.projectName }))))
      .catch(() => {});
  }, [subType, mixVisualMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!auth.currentUser) return;
    fetchUserWorlds(auth.currentUser.uid)
      .then(worlds => setAvailableWorlds(worlds.map(w => ({ id: w.id, name: w.name, coverImage: w.coverImage }))))
      .catch(() => {});
  }, []);

  // ── Navigation ──────────────────────────────────────────────────────────────
  // Logical steps: 0=Type 1=Format 2=Content 3=World 4=Cast 5=Details 6=Settings
  // step 1 skipped for BOOK/PHOTO/GAME; step 4 skipped unless VIDEO MOVIE/TV_SERIES
  const hasCastStep = type === 'VIDEO' && (subType === 'MOVIE' || subType === 'TV_SERIES');
  const isFilm = hasCastStep; // VIDEO + MOVIE/TV_SERIES — shows the film distribution step
  const skipStep1 = !hasSubtype(type);
  const skipStep4 = !hasCastStep;

  // Label content steps/upload by the actual type, not always "Tracks".
  const contentNoun = subType === 'PODCAST' ? 'Episodes'
    : subType === 'MIX' ? 'Mix'
    : type === 'VIDEO' ? 'Videos'
    : type === 'PHOTO' ? 'Photos'
    : type === 'BOOK' ? 'Chapters'
    : 'Tracks';
  const labels = (() => {
    if (skipStep1) return ['Type', 'Content', 'World', 'Details', 'Settings', contentNoun];
    if (hasCastStep) return ['Type', 'Format', 'Content', 'World', 'Cast', 'Details', 'Settings', contentNoun];
    return ['Type', 'Format', 'Content', 'World', 'Details', 'Settings', contentNoun];
  })();

  const toDisplay = (logical: number) => {
    let d = logical;
    if (skipStep1 && logical >= 2) d--;
    if (skipStep4 && logical >= 5) d--;
    return d;
  };
  const toLogical = (display: number) => {
    let l = display;
    if (skipStep1 && display >= 1) l++;
    if (skipStep4 && l >= 4) l++;
    return l;
  };

  const totalDisplaySteps = labels.length;
  const displayStep = toDisplay(step);

  // Paging direction for the mobile slide transition (1 = forward, -1 = back).
  const [pageDir, setPageDir] = useState(1);
  const goNext = () => {
    setPageDir(1);
    if (step === 0) {
      setStep(skipStep1 ? 2 : 1);
    } else {
      const next = step + 1;
      setStep(next === 4 && skipStep4 ? 5 : Math.min(next, 7));
    }
  };
  const goBack = () => {
    if (step === 0) return;
    setPageDir(-1);
    if (step === 2 && skipStep1) {
      setStep(0);
    } else if (step === 5 && skipStep4) {
      setStep(3);
    } else {
      setStep(s => Math.max(s - 1, 0));
    }
  };

  // ── File handlers ────────────────────────────────────────────────────────────
  // ── Mix source: pull audio from one of the artist's Reello videos ──
  const loadReelloVideos = async () => {
    setMixReelloOpen(true);
    if (!auth.currentUser || mixReelloVideos.length) return;
    setMixReelloLoading(true);
    try { const vids = await fetchUserVideos(auth.currentUser.uid); setMixReelloVideos(vids || []); }
    catch (err) { console.error('Failed to load Reello videos:', err); }
    finally { setMixReelloLoading(false); }
  };
  const pickReelloVideo = (v: Video) => {
    if (!v.url) { alert('That video is streamed only — no downloadable audio yet. Pick one with a direct file, or upload instead.'); return; }
    const anyV = v as any;
    setTracks([{
      id: `mixtrk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title: v.title || 'DJ Set',
      artist: artist || (v as any).ownerName || '',
      url: v.url,
      mediaKind: 'AUDIO',
      soundOfVideoId: v.id,
      albumCover: anyV.thumbnailUrl || anyV.coverImage,
    } as Track]);
    setMixSourceKind('REELLO');
    setMixSourceVideoId(v.id);
  };

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const fileArray = Array.from(files) as File[];

    if (type === 'BOOK') {
      const BOOK_EXTS = new Set(['epub','pdf','txt','cbz','cbr','docx','rtf','fb2','html','htm','mobi','azw','azw3','djvu']);
      const getBookFormat = (file: File): BookChapter['format'] => {
        const ext = file.name.toLowerCase().split('.').pop() || '';
        if (ext === 'epub') return 'EPUB';
        if (ext === 'pdf') return 'PDF';
        if (ext === 'cbz' || ext === 'cbr') return 'COMIC';
        if (ext === 'docx') return 'DOCX';
        if (ext === 'rtf') return 'RTF';
        if (ext === 'fb2') return 'FB2';
        if (ext === 'html' || ext === 'htm') return 'HTML';
        if (ext === 'mobi' || ext === 'azw' || ext === 'azw3') return 'MOBI';
        if (ext === 'djvu') return 'DJVU';
        if (ext === 'txt' || file.type === 'text/plain') return 'TXT';
        if (file.type === 'application/epub+zip') return 'EPUB';
        if (file.type === 'application/pdf') return 'PDF';
        return 'FILE';
      };
      const isBookFile = (file: File) => {
        const ext = file.name.toLowerCase().split('.').pop() || '';
        return BOOK_EXTS.has(ext) ||
          file.type === 'application/pdf' ||
          file.type === 'application/epub+zip' ||
          file.type === 'text/plain' ||
          file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          file.type === 'application/rtf' || file.type === 'text/rtf' ||
          file.type === 'text/html';
      };
      const newChapters: BookChapter[] = [];
      for (const file of fileArray) {
        if (isBookFile(file)) {
          const fmt = getBookFormat(file);
          newChapters.push({
            id: Math.random().toString(36).substr(2, 9),
            title: file.name.replace(/\.[^/.]+$/, "").replace(/^\d+\s*[-_]*\s*/, "").replace(/[-_]/g, ' ').trim(),
            url: URL.createObjectURL(file),
            format: fmt,
            price: 0,
            isPaywalled: false
          });
        }
      }
      setBookChapters(prev => [...prev, ...newChapters]);
    } else if (type === 'PHOTO') {
      const newSlideshow: string[] = [];
      const newFiles: File[] = [];
      for (const file of fileArray) {
        if (file.type.startsWith('image/')) {
          newSlideshow.push(URL.createObjectURL(file));
          newFiles.push(file);
        }
      }
      setSlideshow(prev => [...prev, ...newSlideshow]);
      setSlideshowFiles(prev => [...prev, ...newFiles]);
    } else {
      const newTracks: Track[] = [];
      let playlistOrder: string[] = [];
      const xmlFile = fileArray.find(f => f.name.toLowerCase().endsWith('.xml'));
      if (xmlFile) {
        try {
          const text = await xmlFile.text();
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(text, "text/xml");
          const trackNodes = xmlDoc.getElementsByTagName("track");
          for (let i = 0; i < trackNodes.length; i++) {
            const titleNode = trackNodes[i].getElementsByTagName("title")[0];
            const locNode = trackNodes[i].getElementsByTagName("location")[0];
            if (titleNode?.textContent) playlistOrder.push(titleNode.textContent.toLowerCase());
            else if (locNode?.textContent) playlistOrder.push(decodeURIComponent(locNode.textContent).toLowerCase());
          }
        } catch (e) { console.error("Failed to parse playlist XML", e); }
      }
      // All audio extensions we support — match by extension too since exotic formats
      // (AIFF, APE, WavPack, FLAC, 24-bit WAV, etc.) may have type='' or type='application/octet-stream'
      const KNOWN_AUDIO_EXTS = new Set([
        'mp3','mp2','mp1','m4a','aac','ogg','oga','opus','webm','weba','wav','wave','bwf','rf64','w64',
        'flac','aiff','aif','aifc','alac','ape','wv','tta','tak','shn','caf','mka','wma','ra','rm',
        'ac3','eac3','dts','dtshd','mpc','amr','gsm','iamf','mid','midi','kar','mod','xm','it','s3m',
      ]);
      const VIDEO_EXTS = new Set(['mp4','mov','qt','mkv','m4v','avi','wmv','flv','mpg','mpeg','m2v','m2ts','mts','ts','3gp','3g2','ogv','webm','mxf','gxf','vob','asf','f4v','divx','r3d','braw','dpx','exr']);
      for (const file of fileArray) {
        const ext = file.name.toLowerCase().split('.').pop() ?? '';
        const isKnownAudio = KNOWN_AUDIO_EXTS.has(ext);
        const isVideo = file.type.startsWith('video/') || (!isKnownAudio && VIDEO_EXTS.has(ext));
        if (isKnownAudio || isVideo || file.type.startsWith('audio/')) {
          newTracks.push({
            id: Math.random().toString(36).substr(2, 9),
            title: file.name.replace(/\.[^/.]+$/, "").replace(/^\d+\s*[-_]*\s*/, ""),
            artist: artist || "Unknown Artist",
            file,
            url: URL.createObjectURL(file),
            price: 0,
            isPaywalled: false,
            genre,
            mediaKind: isVideo ? 'VIDEO' : 'AUDIO',
            ...(ext === 'iamf' && { isEclipsa: true }),
          });
        }
      }
      if (playlistOrder.length > 0) {
        newTracks.sort((a, b) => {
          const idxA = playlistOrder.findIndex(p => a.title.toLowerCase().includes(p) || p.includes(a.title.toLowerCase()));
          const idxB = playlistOrder.findIndex(p => b.title.toLowerCase().includes(p) || p.includes(b.title.toLowerCase()));
          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
          if (idxA !== -1) return -1;
          if (idxB !== -1) return 1;
          return 0;
        });
      }
      setTracks(prev => [...prev, ...newTracks]);
      // Warn on camera-raw / image-sequence formats Mux can't stream.
      const RAW_EXTS = new Set(['dpx', 'r3d', 'braw', 'exr', 'ari', 'arri', 'raw']);
      const raw = fileArray.filter(f => RAW_EXTS.has((f.name.toLowerCase().split('.').pop() ?? '')));
      if (raw.length) {
        setRawFormatNote(`${raw.length === 1 ? raw[0].name : `${raw.length} files`} looks like a camera-raw / image-sequence format (DPX/R3D/BRAW/EXR). Mux can't stream those — it'll upload and stay under your account, but export a ProRes, DNxHD, or H.264 master (MOV/MP4/MXF) for playback.`);
      }
    }
  };

  const updateTrack = useCallback((id: string, updates: Partial<Track>) => {
    setTracks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

  const stopPreview = useCallback(() => {
    if (previewAudioRef.current) { previewAudioRef.current.pause(); previewAudioRef.current = null; }
    setPreviewingId(null);
  }, []);

  const togglePreview = useCallback((track: Track) => {
    if (previewingId === track.id) { stopPreview(); return; }
    stopPreview();
    const audio = new Audio(track.url);
    audio.onended = () => setPreviewingId(null);
    audio.onerror = () => setPreviewingId(null);
    audio.play().catch(() => setPreviewingId(null));
    previewAudioRef.current = audio;
    setPreviewingId(track.id);
  }, [previewingId, stopPreview]);

  /**
   * The lines to time-code. Prefer the typed lyrics, but fall back to the TRANSCRIPTION's own
   * text — a track that was auto-transcribed but never had lyrics pasted in used to be locked
   * out of manual syncing entirely (the editor read `track.lyrics`, found nothing, and refused
   * to open), which is why hand-timing appeared to "default" instead of loading the transcript.
   */
  const lyricLinesFor = useCallback((track: Partial<Track>): string[] => sharedLyricLinesFor(track), []);

  /** Pull the transcribed text into the editable lyrics field so it can be corrected by hand. */
  const importTranscription = useCallback((track: Track) => {
    const text = transcriptionToText(track);
    if (text) updateTrack(track.id, { lyrics: text });
  }, [updateTrack]);

  /**
   * Carry a lyrics-box correction onto the already-synced timings.
   *
   * The album-page viewer renders `timeCodedLyrics[].text` and never falls back to
   * `track.lyrics`, so once a track was synced, fixing a typo in the lyrics box changed
   * nothing on playback — the old misspelling kept showing. This keeps the two in step,
   * preserving every timestamp exactly as it was synced.
   *
   * Only applies to a *correction*: same number of lines, and most lines untouched. A
   * wholesale rewrite, or added/removed lines, can't be mapped onto the old timings without
   * guessing which line belongs to which moment — those are left alone and surfaced in the
   * UI as needing a re-sync, rather than silently mangled.
   */
  const reconcileTimedLyricText = useCallback((track: Partial<Track>, lyrics: string): { timeCodedLyrics: NonNullable<Track['timeCodedLyrics']> } | null => {
    const next = sharedReconcile(track, lyrics);
    return next ? { timeCodedLyrics: next } : null;
  }, []);

  /** Whether the lyrics box and the synced captions have drifted apart, and how badly. */
  const timedLyricDrift = useCallback((track: Partial<Track>): 'none' | 'text' | 'count' => sharedDrift(track), []);

  /** Force the typed words onto the existing timings by line order (user-confirmed). */
  const applyLyricsToTimings = useCallback((track: Track) => {
    const next = sharedApplyLyrics(track);
    if (next) updateTrack(track.id, { timeCodedLyrics: next });
  }, [updateTrack]);

  /** Nudge one line's timestamp by delta seconds, keeping the list ordered and non-negative. */
  const nudgeLyricTime = useCallback((track: Track, index: number, delta: number) => {
    updateTrack(track.id, { timeCodedLyrics: sharedNudge(track.timeCodedLyrics || [], index, delta) });
  }, [updateTrack]);

  /** Set one line's timestamp outright (typed input, mm:ss or seconds). */
  const setLyricTime = useCallback((track: Track, index: number, seconds: number) => {
    updateTrack(track.id, { timeCodedLyrics: sharedSetTime(track.timeCodedLyrics || [], index, seconds) });
  }, [updateTrack]);

  /**
   * Transcribe + time-code an album's music tracks AFTER publish, when each track has a real
   * https URL the server can fetch. Uses the same `/api/ai/captions` endpoint as the player's
   * "Sync Lyrics" (windowed transcription — short audio windows anchored by ffmpeg, so timings
   * can't accumulate drift). Best-effort and fully non-fatal: a track that fails simply keeps
   * its plain lyrics, which is far better than confidently wrong timings.
   */
  const syncCaptionsAfterPublish = useCallback(async (album: any) => {
    const list: Track[] = Array.isArray(album?.tracks) ? album.tracks : [];
    const targets = list.filter(t =>
      typeof t?.url === 'string' && /^https?:/i.test(t.url) &&
      (t.mediaKind !== 'VIDEO') &&
      (!t.timeCodedLyrics || t.timeCodedLyrics.length === 0)
    );
    if (targets.length === 0 || !album?.id) return;

    const token = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => null) : null;
    const updated = [...list];
    let changed = false;

    for (const track of targets) {
      try {
        const res = await fetch('/api/ai/captions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ audioUrl: track.url, title: track.title, artist: album.artist }),
        });
        if (!res.ok) continue;
        const data = await res.json().catch(() => ({}));
        const captions = data?.captions;
        if (Array.isArray(captions) && captions.length > 0) {
          const i = updated.findIndex(t => t.id === track.id);
          if (i >= 0) { updated[i] = { ...updated[i], timeCodedLyrics: captions }; changed = true; }
        }
      } catch { /* leave this track unsynced rather than fabricate timings */ }
    }

    if (changed) {
      try {
        const { updateAlbum } = await import('../services/backendService');
        await updateAlbum(album.id, { tracks: updated } as any);
        onCreated({ ...album, tracks: updated });
      } catch { /* best-effort */ }
    }
  }, [onCreated]);

  const openTapSync = useCallback((track: Track) => {
    stopPreview();
    if (tapAudioRef.current) { tapAudioRef.current.pause(); tapAudioRef.current = null; }
    if (tapRafRef.current) cancelAnimationFrame(tapRafRef.current);
    setTapCurrentLine(0);
    setTapTimes([]);
    setTapIsPlaying(false);
    setTapCurrentTime(0);
    setTapDuration(0);
    setTapSyncTrackId(track.id);
  }, [stopPreview]);

  const closeTapSync = useCallback((savePartial = false) => {
    if (savePartial && tapSyncTrackId && tapTimes.length > 0) {
      const track = tracks.find(t => t.id === tapSyncTrackId);
      if (track) {
        const lines = lyricLinesFor(track);
        const timeCodedLyrics = lines.slice(0, tapTimes.length).map((text: string, i: number) => ({ time: tapTimes[i], text: text.trim() }));
        if (timeCodedLyrics.length > 0) updateTrack(tapSyncTrackId, { timeCodedLyrics });
      }
    }
    if (tapAudioRef.current) { tapAudioRef.current.pause(); tapAudioRef.current = null; }
    if (tapRafRef.current) { cancelAnimationFrame(tapRafRef.current); tapRafRef.current = null; }
    setTapSyncTrackId(null);
    setTapIsPlaying(false);
    setTapCurrentTime(0);
    setTapCurrentLine(0);
    setTapTimes([]);
  }, [tapSyncTrackId, tapTimes, tracks, updateTrack]);

  const tapPlay = useCallback((track: Track) => {
    if (!tapAudioRef.current) {
      const audio = new Audio(track.url);
      audio.onloadedmetadata = () => setTapDuration(audio.duration);
      audio.onended = () => setTapIsPlaying(false);
      tapAudioRef.current = audio;
    }
    tapAudioRef.current.play().catch(() => {});
    setTapIsPlaying(true);
    const tick = () => {
      if (tapAudioRef.current && !tapAudioRef.current.paused) {
        setTapCurrentTime(tapAudioRef.current.currentTime);
        tapRafRef.current = requestAnimationFrame(tick);
      }
    };
    tapRafRef.current = requestAnimationFrame(tick);
  }, []);

  const tapPause = useCallback(() => {
    if (tapAudioRef.current) tapAudioRef.current.pause();
    if (tapRafRef.current) { cancelAnimationFrame(tapRafRef.current); tapRafRef.current = null; }
    setTapIsPlaying(false);
  }, []);

  const tapRestart = useCallback((track: Track) => {
    if (tapAudioRef.current) { tapAudioRef.current.pause(); tapAudioRef.current = null; }
    if (tapRafRef.current) { cancelAnimationFrame(tapRafRef.current); tapRafRef.current = null; }
    setTapCurrentLine(0);
    setTapTimes([]);
    setTapIsPlaying(false);
    setTapCurrentTime(0);
    // re-open fresh audio
    const audio = new Audio(track.url);
    audio.onloadedmetadata = () => setTapDuration(audio.duration);
    audio.onended = () => setTapIsPlaying(false);
    tapAudioRef.current = audio;
  }, []);

  const handleTap = useCallback((track: Track) => {
    if (!tapAudioRef.current) return;
    const time = tapAudioRef.current.currentTime;
    const lines = lyricLinesFor(track);
    const newTimes = [...tapTimes, time];
    const nextLine = tapCurrentLine + 1;
    if (nextLine >= lines.length) {
      // All lines stamped — save and close
      const timeCodedLyrics = lines.map((text: string, i: number) => ({ time: newTimes[i] ?? 0, text: text.trim() }));
      updateTrack(track.id, { timeCodedLyrics });
      closeTapSync(false);
    } else {
      setTapTimes(newTimes);
      setTapCurrentLine(nextLine);
    }
  }, [tapTimes, tapCurrentLine, updateTrack, closeTapSync, lyricLinesFor]);

  const runQcForTrack = useCallback(async (track: Track): Promise<TrackQcResult> => {
    // Video tracks get real video verification (decode a frame, catch corruption).
    const looksVideo = track.mediaKind === 'VIDEO'
      || (track.file && track.file.type.startsWith('video'))
      || /\.(mp4|mov|webm|mkv|avi|m4v|hevc|ogv)(\?|$)/i.test(track.url || '');
    if (looksVideo) {
      const probe = await probeVideo(track.file || track.url);
      return {
        status: probe.status, kind: 'VIDEO', duration: probe.duration, width: probe.width, height: probe.height,
        issue: probe.issue || (probe.status === 'pass' ? `Pass — ${(probe.duration || 0).toFixed(1)}s, ${probe.width}×${probe.height}` : undefined),
      };
    }
    try {
      const res = await fetch(track.url);
      const buf = await res.arrayBuffer();
      if (buf.byteLength === 0) return { status: 'fail', issue: 'File is empty (0 bytes) — re-upload the audio file' };
      const ctx = new AudioContext();
      let audioBuffer: AudioBuffer;
      try {
        audioBuffer = await ctx.decodeAudioData(buf.slice(0));
      } catch (e: any) {
        ctx.close();
        return { status: 'fail', issue: `Could not decode audio: ${e?.message || 'unsupported format'}` };
      }
      ctx.close();
      const dur = audioBuffer.duration;
      if (dur < 0.5) return { status: 'fail', duration: dur, issue: `Track is too short (${dur.toFixed(2)}s) — likely a corrupt or empty file` };
      let peak = 0, sumSq = 0, n = 0;
      for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
        const d = audioBuffer.getChannelData(c);
        for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sumSq += d[i] * d[i]; n++; }
      }
      const rms = Math.sqrt(sumSq / (n || 1));
      if (rms < 0.0005) return { status: 'fail', duration: dur, peak, rms, issue: 'Track is silent — listeners will hear nothing' };
      if (peak >= 0.999) return { status: 'warn', duration: dur, peak, rms, issue: 'Clipping detected — peaks are at max amplitude, may sound distorted' };
      return { status: 'pass', duration: dur, peak, rms };
    } catch (e: any) {
      if (track.url && !track.url.startsWith('blob:')) return { status: 'warn', issue: 'Remote file — verify audio plays correctly before publishing' };
      return { status: 'fail', issue: `Analysis error: ${e?.message || 'unknown'}` };
    }
  }, []);

  const runAllQc = useCallback(async () => {
    const toCheck = tracks.filter(t => t.url);
    if (!toCheck.length) return;
    setIsQcRunning(true);
    for (const track of toCheck) {
      setQcResults(prev => ({ ...prev, [track.id]: { status: 'running' } }));
      const result = await runQcForTrack(track);
      setQcResults(prev => ({ ...prev, [track.id]: result }));
    }
    setIsQcRunning(false);
  }, [tracks, runQcForTrack]);

  const handleGenerateAI = useCallback(async () => {
    if (!title) return;
    setStatus({ text: "Consulting AI Architect...", percent: 30 });
    const trackNames = tracks.map(t => t.title);
    const metadata = await generateAlbumMetadata(title, trackNames);
    setArtistBio(metadata.description);
    setStatus({ text: "", percent: 0 });
  }, [title, tracks]);

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;
    // Autosave runs "quiet": no deploy overlay, no QC gate, no alerts — just persist a draft.
    const quiet = quietSaveRef.current; quietSaveRef.current = false;
    // "Save as draft" sets this ref; a draft is unlisted and can be resumed + refined later.
    const asDraft = saveAsDraftRef.current; saveAsDraftRef.current = false;
    const draftMode = isDraft || asDraft;
    // ── Content-type gate ───────────────────────────────────────────────────
    // A video must be categorized before PUBLISH (drafts/autosave can save uncategorized).
    if (type === 'VIDEO' && !subType && !draftMode) {
      setPageDir(-1);
      setStep(1); // subtype selection
      alert('Choose a video content type — Reello, Movie, TV, or Podcast — before publishing.');
      return;
    }
    if (!quiet) {
      setIsDeploying(true);
      setStatus({ text: initialAlbum ? "Updating Cloud Index..." : "Synthesizing Metadata...", percent: 5 });
    }
    try {
      // ── Video verification gate ──────────────────────────────────────────
      // Auto-QC every video before PUBLISH (skipped for drafts/autosave — it's a publish gate).
      if (type === 'VIDEO' && !draftMode) {
        setStatus({ text: 'Verifying video…', percent: 3 });
        const vids = tracks.filter(t => t.file || t.url);
        for (const t of vids) {
          const looksVideo = t.mediaKind === 'VIDEO'
            || (t.file && t.file.type.startsWith('video'))
            || /\.(mp4|mov|webm|mkv|avi|m4v|hevc|ogv)(\?|$)/i.test(t.url || '');
          if (!looksVideo) continue;
          const probe = await probeVideo(t.file || t.url);
          setQcResults(prev => ({ ...prev, [t.id]: { status: probe.status, kind: 'VIDEO', duration: probe.duration, width: probe.width, height: probe.height, issue: probe.issue } }));
          if (probe.status === 'fail') {
            setIsDeploying(false);
            setStatus(null);
            setPageDir(-1);
            setStep(2); // content / files step
            alert(`Video "${t.title || 'file'}" failed verification: ${probe.issue}\n\nFix or replace it before publishing.`);
            return;
          }
        }
      }

      const trackNames = type === 'BOOK' ? bookChapters.map(c => c.title) : tracks.map(t => t.title);

      // NOTE: this used to fabricate timings by dividing the duration by the line count and
      // spacing lines evenly. That is arithmetic, not synchronisation — it never listens to the
      // audio, so it drifts immediately and any intro/solo/bridge throws it out completely
      // (captions "stop", then coincidentally realign later). That was the random-drift bug.
      // Real transcription needs a URL the server can fetch, and at this point track.url is
      // still a local blob — so the sync now runs AFTER publish, in onDone below, against the
      // uploaded https URL. Tracks publish with plain lyrics until it lands.
      const autoSyncedTracks = tracks;

      let description = initialAlbum?.description || "";
      let themeColor = initialAlbum?.themeColor || "#ffffff";
      if (!initialAlbum) {
        const metadata = await generateAlbumMetadata(title, trackNames);
        description = metadata.description;
        themeColor = metadata.themeColor;
        if (!linerNotes) setLinerNotes(metadata.linerNotes);
      }
      const albumId = projectIdRef.current;

      // ── World & character creation ─────────────────────────────────────────
      let finalWorldId = worldId;
      if (worldAssignment === 'NEW' && newWorldName.trim() && auth.currentUser) {
        setStatus({ text: 'Creating World...', percent: 8 });
        const newWorld = await createIPWorld({
          creatorId: auth.currentUser.uid,
          name: newWorldName.trim(),
          assetIds: [albumId],
        });
        finalWorldId = newWorld?.id;
      } else if (worldAssignment === 'EXISTING' && worldId) {
        setStatus({ text: 'Linking to World...', percent: 8 });
        await addAssetToWorld(worldId, albumId);
      }

      const createdCharacterIds: string[] = [];
      if (finalWorldId && draftCharacters.length > 0) {
        setStatus({ text: 'Creating Characters...', percent: 12 });
        for (const char of draftCharacters) {
          const created = await createCharacter({
            worldId: finalWorldId,
            name: char.name,
            role: char.role,
            bio: '',
            tags: [],
            appearanceAt: [{ projectId: albumId, timestamp: Date.now() }],
            isPublished: true,
          });
          if (created) {
            createdCharacterIds.push(created.id);
          }
        }
        // Add all new character IDs to the world in one write
        await addCharactersToWorld(finalWorldId, createdCharacterIds);
      }
      const finalMovieMetadata: MovieMetadata = {
        ...movieMetadata,
        castMembers,
        productionCredits,
        cast: castMembers.map(m => m.actorName + (m.characterName ? ` as ${m.characterName}` : '')),
        crew: productionCredits.map(c => `${c.name} (${c.role})`),
      };

      // Map the film/TV distribution choices onto the album (legacy flags + the structured
      // filmDistribution). Films/TV go straight to the Taleo experience on publish.
      const filmFields: Partial<Album> = isFilm ? (() => {
        const d = filmDist;
        const isPaid = d.model !== 'FREE_FAST';
        const px = d.model === 'RENTAL' ? (d.rentalPrice || 0) : (d.purchasePrice || 0);
        return {
          isAdSupported: d.model === 'FREE_FAST' || !!d.fastChannel,
          isPaywalled: isPaid,
          price: isPaid ? px : 0,
          isPrivate: d.release === 'PRIVATE',
          isPublic: d.release !== 'PRIVATE' && !draftMode,
          isScheduled: d.release === 'SCHEDULED',
          releaseDate: d.release === 'SCHEDULED' ? d.releaseAt : undefined,
          earlyAccessEnabled: d.release === 'EARLY_ACCESS',
          filmDistribution: d,
        };
      })() : {};

      // UGC / Reello video — publish a single video straight to Reello via the non-blocking Mux
      // pipeline (uploadVideo: creates the record immediately, resolves the HLS URL in the background).
      if (type === 'VIDEO' && subType === 'UGC') {
        const vidTrack = tracks.find(t => t.file) || tracks[0];
        if (!vidTrack?.file) { alert('Add a video file first.'); setStatus(null); return; }
        const vidFile = vidTrack.file;
        const vidTitle = title || vidTrack.title || 'Untitled';
        enqueue({
          title: vidTitle,
          kind: 'Reello',
          run: (onProgress) => uploadVideo({
            title: vidTitle, description, file: vidFile, thumbnailFile: coverFile, coverImageFile: coverFile,
            genre, isRello: true, isPrivate, tags,
          } as any, (p) => onProgress('Uploading to Reello…', Math.max(5, Math.round(p)))),
          onDone: (created) => onCreated(created as any),
        });
        onCancel?.();
        return;
      }

      const newAlbum: Album = {
        ...initialAlbum,
        id: albumId, title,
        artist: artist || "Unknown Artist",
        artistCharacterId: artistCharacterId || undefined,
        artistWorldId: artistWorldId || undefined,
        type: type as Album['type'],
        subType: subType as Album['subType'], genre, price, isPaywalled,
        mixMeta: subType === 'MIX' ? {
          visualMode: mixVisualMode,
          pixelsProjectId: mixVisualMode === 'AUTHORED' ? (mixPixelsProjectId || undefined) : undefined,
          source: mixSourceKind,
          sourceVideoId: mixSourceKind === 'REELLO' ? (mixSourceVideoId || undefined) : undefined,
          allowComments: mixAllowComments,
          durationSec: autoSyncedTracks[0]?.duration || undefined,
        } : undefined,
        artistBio: artistBio || `Exploring the boundaries of creativity as ${artist}.`,
        linerNotes,
        artistImage: artistImage || coverImage,
        artistFile, coverImage, coverFile, description, themeColor,
        tracks: autoSyncedTracks, slideshow, slideshowFiles, galleryUrl, socialLinks,
        musicVideos: type === 'VIDEO' && subType === 'MOVIE' ? musicVideos.map(v => ({ ...v, movieMetadata: finalMovieMetadata })) : musicVideos,
        videoPlaylists,
        seasons: type === 'VIDEO' && subType === 'TV_SERIES' ? seasons : undefined,
        movieMetadata: (type === 'VIDEO' && (subType === 'MOVIE' || subType === 'TV_SERIES')) ? finalMovieMetadata : undefined,
        alternateVersions: isFilm ? alternateVersions : undefined,
        bookChapters, bookPreviewConfig, allowPageSharing: type === 'BOOK' ? allowPageSharing : undefined, liveFeedUrl, donationGoal, tags, relatedProjectIds, trackListLabel: trackListLabel || undefined,
        gameUrl: type === 'GAME' ? gameUrl : undefined,
        gameVideoUrl: type === 'GAME' ? gameVideoUrl : undefined,
        gameScreenshots: type === 'GAME' ? gameScreenshots : undefined,
        gameFeatures: type === 'GAME' ? gameFeatures : undefined,
        createdAt: initialAlbum?.createdAt || Date.now(),
        license,
        isPublic: !isPrivate && !draftMode,
        isPrivate, isIntimateOnly, isDraft: draftMode, isScheduled, publishVideosToGallery, isSlideshowEnabled,
        publishToAudius: type === 'MUSIC' ? publishToAudius : undefined,
        audiusPublishStatus: (type === 'MUSIC' && publishToAudius) ? 'pending' as const : initialAlbum?.audiusPublishStatus,
        releaseDate: releaseDate ? new Date(releaseDate).getTime() : undefined,
        worldId: finalWorldId,
        characterIds: createdCharacterIds.length > 0 ? createdCharacterIds : initialAlbum?.characterIds,
        hideNSeekConfig: hnsEnabled ? {
          isEnabled: hnsEnabled,
          globalEnabled: hnsGlobalMode,
          windows: hnsWindows,
          trackConfigs: type === 'MUSIC' ? hnsTrackConfigs : undefined
        } : undefined,
        ...filmFields,
      };
      // When editing an existing item, reflect the change in any open view IMMEDIATELY
      // (e.g. a renamed track in the album tracklist) instead of waiting for the background
      // publish to finish. Strip File handles so shared app state never holds blob refs.
      if (initialAlbum) {
        const optimistic = {
          ...newAlbum,
          coverFile: undefined, artistFile: undefined, slideshowFiles: undefined,
          tracks: (newAlbum.tracks || []).map((t: any) => { const { file, ...rest } = t; return rest; }),
        } as Album;
        onCreated(optimistic);
      }
      // Publish in the background so the creator can close and multiple uploads can run at once.
      enqueue({
        title: title || 'Untitled',
        kind: contentNoun,
        run: (onProgress) => publishToCloud(newAlbum, onProgress),
        onDone: (published) => {
          const finalAlbum: any = typeof published === 'string' ? newAlbum : published;
          onCreated(finalAlbum);
          // Kick off transcode-to-streaming-ladder for music tracks (background; status-gated, so
          // playback keeps using the original until the AAC/HLS + FLAC renditions are ready).
          if (type === 'MUSIC' && Array.isArray(finalAlbum?.tracks)) {
            for (const t of finalAlbum.tracks) {
              if (t?.id && typeof t.url === 'string' && /^https?:/i.test(t.url)) enqueueTranscode(t.id, t.url).catch(() => {});
            }
            // REAL caption sync, now that the audio has a URL the server can fetch. This hits the
            // same windowed-transcription endpoint the player's "Sync Lyrics" uses (short audio
            // windows anchored to real timestamps), instead of guessing evenly-spaced times.
            void syncCaptionsAfterPublish(finalAlbum);
          }
        },
      });
      setIsDirty(false);
      if (keepOpenAfterSaveRef.current) {
        // "Save Now" / autosave — persist a draft but stay in the editor.
        keepOpenAfterSaveRef.current = false;
        if (quiet) { setAutosaveState('saved'); }
        else { setSavedFlash(true); setTimeout(() => setSavedFlash(false), 2500); }
      } else {
        onCancel?.();
      }
      return;
    } catch (err: any) {
      console.error("Deployment Error:", err);
      keepOpenAfterSaveRef.current = false;
      setAutosaveState('idle');
      if (!quiet) alert(`Error: ${err?.message || "Deployment failed."}`);
    } finally {
      setIsDeploying(false);
    }
  };

  // Save the current project as a draft WITHOUT closing the editor (persistent "Save Now").
  const saveNow = () => {
    if (isDeploying) return;
    if (!title.trim()) { alert('Add a title before saving.'); return; }
    keepOpenAfterSaveRef.current = true;
    saveAsDraftRef.current = true;
    handleSubmit(new Event('submit') as unknown as React.FormEvent);
  };

  // Silent autosave (draft). Skipped while there are pending local file uploads — those are
  // persisted by explicit Save Now / Publish; autosave keeps metadata + track order safe instantly.
  const autosave = () => {
    if (isDeploying) return;
    if (!title.trim()) return;
    if (coverFile || artistFile || tracks.some(t => !!t.file)) return;
    quietSaveRef.current = true;
    keepOpenAfterSaveRef.current = true;
    saveAsDraftRef.current = true;
    setAutosaveState('saving');
    handleSubmit(new Event('submit') as unknown as React.FormEvent);
  };

  // Move a track up/down — obvious, accessible reordering (no drag needed).
  const moveTrack = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= tracks.length) return;
    const r = [...tracks];
    [r[i], r[j]] = [r[j], r[i]];
    setTracks(r);
  };

  // Close the editor, but guard unsaved work: prompt to save a draft or discard.
  const requestClose = () => {
    if (isDeploying) return;
    if (isDirty) { setShowLeaveConfirm(true); return; }
    onCancel?.();
  };

  // Mark the project dirty on any edit to a core field, so the leave-guard can protect it.
  const dirtyInitRef = useRef(true);
  useEffect(() => {
    if (dirtyInitRef.current) { dirtyInitRef.current = false; return; }
    setIsDirty(true);
  }, [title, artist, type, subType, genre, price, isPaywalled, artistBio, linerNotes, artistImage, coverImage,
      JSON.stringify(tracks), JSON.stringify(bookChapters), JSON.stringify(slideshow), JSON.stringify(musicVideos),
      JSON.stringify(videoPlaylists), JSON.stringify(socialLinks), JSON.stringify(tags)]);

  // Native "Leave site?" prompt (browser close / refresh / tab nav) while there are unsaved edits.
  useEffect(() => {
    if (!isDirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [isDirty]);

  // Debounced autosave — persist a draft ~3.5s after the last change (guards live in autosave()).
  const autosaveInitRef = useRef(true);
  useEffect(() => {
    if (autosaveInitRef.current) { autosaveInitRef.current = false; return; }
    if (!title.trim() || isDeploying) return;
    const t = setTimeout(() => autosave(), 3500);
    return () => clearTimeout(t);
  }, [title, artist, type, subType, genre, price, isPaywalled, artistBio, linerNotes, artistImage, coverImage,
      JSON.stringify(tracks), JSON.stringify(bookChapters), JSON.stringify(slideshow), JSON.stringify(musicVideos),
      JSON.stringify(videoPlaylists), JSON.stringify(socialLinks), JSON.stringify(tags)]);

  if (isMinimized) return null;

  // ── Genre options ────────────────────────────────────────────────────────────
  const genreOptions: Record<AssetType, string[]> = {
    MUSIC:  ['Pop', 'Rock', 'Hip Hop', 'Jazz', 'Electronic', 'Classical', 'R&B', 'Country', 'Metal', 'Folk', 'Indie', 'Ambient', 'Techno', 'House', 'Trap', 'Lo-Fi'],
    VIDEO:  ['Cinematic', 'Music Video', 'Documentary', 'Animation', 'Tutorial', 'Vlog', 'Short Film', 'Live Stream', 'Experimental'],
    BOOK:   ['Fiction', 'Non-Fiction', 'Poetry', 'Comic', 'Manga', 'Sci-Fi', 'Fantasy', 'Mystery', 'Thriller', 'Biography', 'History', 'Philosophy', 'Art'],
    PHOTO:  ['Portrait', 'Landscape', 'Street', 'Architecture', 'Nature', 'Abstract', 'Fashion', 'Macro', 'Event', 'Documentary'],
    GAME:   ['Action', 'Adventure', 'Puzzle', 'RPG', 'Simulation', 'Strategy', 'Horror', 'Platformer', 'Indie', 'Visual Novel'],
  };

  // ── Step content renderers ───────────────────────────────────────────────────
  const renderStep0 = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl sm:text-3xl font-display font-black tracking-tight uppercase mb-2">What are you creating?</h2>
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30">Choose a category to begin your workflow</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
        {TYPE_OPTIONS.map(({ id, label, desc, icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => { setType(id); setSubType(undefined); setStep(hasSubtype(id) ? 1 : 2); }}
            className={`flex flex-col items-start gap-5 p-8 rounded-2xl border transition-all text-left hover:scale-[1.02] active:scale-95 ${
              type === id ? 'bg-white text-black border-white shadow-2xl' : 'bg-white/5 border-white/10 hover:bg-white/10 text-white'
            }`}
          >
            <div className={`p-4 rounded-2xl ${type === id ? 'bg-black/10' : 'bg-white/5'}`}>{icon}</div>
            <div>
              <p className="text-sm font-black uppercase tracking-widest mb-1">{label}</p>
              <p className={`text-[9px] font-bold uppercase tracking-widest leading-relaxed ${type === id ? 'text-black/50' : 'text-white/30'}`}>{desc}</p>
            </div>
          </button>
        ))}
        {/* Project Promo — not an asset type: opens the promo-kit folder for an existing project. */}
        <button
          type="button"
          onClick={() => setPromoMode(true)}
          className="relative flex flex-col items-start gap-5 p-8 rounded-2xl border border-small-orange/40 bg-gradient-to-br from-[#6B0099]/25 via-[#D40055]/15 to-transparent hover:from-[#6B0099]/40 hover:via-[#D40055]/25 transition-all text-left hover:scale-[1.02] active:scale-95 text-white"
        >
          <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest text-white" style={{ background: 'linear-gradient(135deg,#D40055,#FF8C00)' }}>New</span>
          <div className="p-4 rounded-2xl bg-white/5 text-small-orange"><Megaphone size={32} /></div>
          <div>
            <p className="text-sm font-black uppercase tracking-widest mb-1">Project Promo</p>
            <p className="text-[9px] font-bold uppercase tracking-widest leading-relaxed text-white/30">Trailers, teasers, key art & audio samples — sized for every Plajah surface</p>
          </div>
        </button>
      </div>
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl sm:text-3xl font-display font-black tracking-tight uppercase mb-2">
          {type === 'MUSIC' ? 'What kind of music release?' : 'What kind of video?'}
        </h2>
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30">Pick the format that fits your project</p>
      </div>
      <div className="grid grid-cols-2 gap-5">
        {(type === 'MUSIC' ? MUSIC_SUBTYPES : VIDEO_SUBTYPES).map(st => (
          <button
            key={st}
            type="button"
            onClick={() => setSubType(subType === st ? undefined : st as any)}
            className={`flex flex-col gap-4 p-8 rounded-2xl border text-left transition-all hover:scale-[1.02] active:scale-95 ${
              subType === st ? 'bg-white text-black border-white shadow-2xl' : 'bg-white/5 border-white/10 hover:bg-white/10'
            }`}
          >
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${subType === st ? 'bg-black/10' : 'bg-white/5'}`}>
              {st === 'UGC' && <Film size={22} />}
              {st === 'MOVIE' && <Film size={22} />}
              {st === 'TV_SERIES' && <Tv size={22} />}
              {st === 'PODCAST' && <Mic2 size={22} />}
              {st === 'ALBUM' && <Music2 size={22} />}
              {st === 'SINGLE' && <Music2 size={22} />}
              {st === 'EP' && <Music2 size={22} />}
              {st === 'MIX' && <Radio size={22} />}
            </div>
            <p className="text-sm font-black uppercase tracking-widest">{st === 'UGC' ? 'Reello Video' : st === 'MIX' ? 'DJ Mix' : st.replace('_', ' ')}</p>
            {st === 'UGC' && <p className="text-[9px] font-bold text-white/40 -mt-2">Your own video — posts to Reello</p>}
            {st === 'MIX' && <p className="text-[9px] font-bold text-white/40 -mt-2">Long DJ set — waveform, comments &amp; Pixels visuals</p>}
          </button>
        ))}
      </div>
      <p className="text-[9px] font-bold uppercase tracking-widest text-white/20">You can skip this — it helps organize your content</p>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl sm:text-3xl font-display font-black tracking-tight uppercase mb-2">Upload Your Content</h2>
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30">
          {type === 'MUSIC' ? 'Add your audio tracks' :
           type === 'VIDEO' ? 'Upload your video content' :
           type === 'BOOK' ? 'Upload your manuscript or chapters' :
           type === 'PHOTO' ? 'Upload your photo collection' :
           'Upload your game files'}
        </p>
      </div>

      {/* Uncategorized video notice — content can't publish or propagate to Taleo /
          Reello until a content type is chosen. */}
      {type === 'VIDEO' && !subType && (
        <button type="button" onClick={() => { setPageDir(-1); setStep(1); }}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left bg-yellow-500/10 border border-yellow-500/30 hover:bg-yellow-500/15 transition-all">
          <AlertTriangle size={18} className="text-yellow-400 shrink-0" />
          <div className="flex-1">
            <p className="text-[11px] font-black uppercase tracking-widest text-yellow-300">Not categorized yet</p>
            <p className="text-[10px] font-bold text-white/50 mt-0.5">Choose a content type — Reello, Movie, TV, or Podcast — before this can publish. Tap to set it.</p>
          </div>
          <span className="text-[9px] font-black uppercase tracking-widest text-yellow-400 shrink-0">Set type →</span>
        </button>
      )}

      {/* Tab bar — only for types that support BTS videos */}
      {(type === 'MUSIC' || (type === 'VIDEO' && !['MOVIE', 'TV_SERIES'].includes(subType || ''))) && (
        <div className="flex gap-1 p-1 bg-white/5 rounded-2xl self-start">
          <button
            type="button"
            onClick={() => setContentTab('tracks')}
            className={`px-5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${contentTab === 'tracks' ? 'bg-white text-black shadow' : 'text-white/40 hover:text-white'}`}
          >
            {type === 'MUSIC' ? 'Audio Tracks' : 'Video Upload'}
          </button>
          <button
            type="button"
            onClick={() => setContentTab('audio_health')}
            className={`px-5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${contentTab === 'audio_health' ? 'bg-small-orange text-black shadow' : 'text-white/40 hover:text-white'}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${tracks.some(t => t.url) ? 'bg-green-400 animate-pulse' : 'bg-white/20'}`} />
            Audio Health
          </button>
          <button
            type="button"
            onClick={() => setContentTab('videos')}
            className={`px-5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${contentTab === 'videos' ? 'bg-white text-black shadow' : 'text-white/40 hover:text-white'}`}
          >
            Videos &amp; BTS
          </button>
          <button
            type="button"
            onClick={() => setContentTab('quality')}
            className={`px-5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${contentTab === 'quality' ? 'bg-green-500 text-white shadow' : 'text-white/40 hover:text-white'}`}
          >
            {(() => {
              const vals = Object.values(qcResults);
              if (vals.some(r => r.status === 'fail')) return <ShieldX size={11} className="text-red-400" />;
              if (vals.some(r => r.status === 'warn')) return <AlertTriangle size={11} className="text-yellow-400" />;
              if (vals.length > 0 && vals.every(r => r.status === 'pass')) return <ShieldCheck size={11} className="text-green-400" />;
              return <ShieldCheck size={11} className="text-white/30" />;
            })()}
            QC Check
          </button>
        </div>
      )}

      {/* Movie Upload */}
      {type === 'VIDEO' && subType === 'MOVIE' && (
        <div className="p-5 bg-white/5 rounded-2xl border border-white/10 space-y-8">
          <h3 className="text-base font-black uppercase tracking-widest flex items-center gap-3">
            <Film className="text-small-orange" size={20} /> Movie File & Metadata
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <label className="block p-8 bg-black/40 border-2 border-dashed border-white/10 rounded-3xl cursor-pointer hover:border-white/20 transition-all text-center group">
                <Upload size={28} className="mx-auto mb-4 text-white/20 group-hover:text-white transition-colors" />
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Main Movie File</p>
                <p className="text-[8px] font-bold text-white/20 mt-2">{tracks[0]?.url ? 'File Selected' : 'No file selected'}</p>
                <input type="file" className="hidden" accept={VIDEO_ACCEPT} onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) { const url = await uploadFile(file, 'VIDEO'); setTracks([{ id: 'movie', title, artist, url, duration: 0 }]); }
                }} />
              </label>
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/30 -mt-3">Optional — you can add or swap the film file anytime, even after release.</p>
              <div className="pt-2 border-t border-white/10">
                <FilmVersionsManager value={alternateVersions} onChange={setAlternateVersions} onUpload={uploadFile} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-[9px] font-black uppercase tracking-widest text-white/40">Release Year</label>
                  <input type="number" value={movieMetadata.releaseYear} onChange={(e) => setMovieMetadata({ ...movieMetadata, releaseYear: parseInt(e.target.value) })} className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm font-bold outline-none text-white" />
                </div>
                <div className="space-y-2">
                  <label className="block text-[9px] font-black uppercase tracking-widest text-white/40">Trailer URL</label>
                  <input type="url" value={movieMetadata.trailerUrl} onChange={(e) => setMovieMetadata({ ...movieMetadata, trailerUrl: e.target.value })} placeholder="YouTube/Vimeo" className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm font-bold outline-none text-white placeholder:text-white/10" />
                </div>
              </div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/30">Cast &amp; crew are added in the next steps.</p>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-white/40">Special Features</h4>
                <button type="button" onClick={() => setMovieMetadata({ ...movieMetadata, specialFeatures: [...(movieMetadata.specialFeatures || []), { id: Math.random().toString(36).substring(7), title: 'New Feature', url: '', type: 'BEHIND_THE_SCENES' }] })} className="px-4 py-2 bg-white/5 rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-white/10 text-white">Add Feature</button>
              </div>
              <div className="space-y-3 max-h-72 overflow-y-auto custom-scrollbar pr-2">
                {(movieMetadata.specialFeatures || []).map((feature, idx) => (
                  <div key={feature.id} className="p-4 bg-black/40 rounded-2xl border border-white/5 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <input type="text" value={feature.title} onChange={(e) => { const f = [...(movieMetadata.specialFeatures || [])]; f[idx].title = e.target.value; setMovieMetadata({ ...movieMetadata, specialFeatures: f }); }} className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest text-white outline-none w-full mb-1" />
                      <label className="text-[8px] font-bold text-white/20 cursor-pointer hover:text-white transition-colors">
                        {feature.url ? 'File Uploaded' : 'Upload Video'}
                        <input type="file" className="hidden" accept={VIDEO_ACCEPT} onChange={async (e) => { const file = e.target.files?.[0]; if (file) { const url = await uploadFile(file, 'VIDEO'); const f = [...(movieMetadata.specialFeatures || [])]; f[idx].url = url; setMovieMetadata({ ...movieMetadata, specialFeatures: f }); } }} />
                      </label>
                    </div>
                    <button type="button" onClick={() => setMovieMetadata({ ...movieMetadata, specialFeatures: movieMetadata.specialFeatures?.filter(f => f.id !== feature.id) })} className="text-white/20 hover:text-red-500"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TV Series Upload */}
      {type === 'VIDEO' && subType === 'TV_SERIES' && (
        <div className="p-5 bg-white/5 rounded-2xl border border-white/10 space-y-8">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black uppercase tracking-widest flex items-center gap-3"><Tv className="text-small-orange" size={20} /> Seasons & Episodes</h3>
            <button type="button" onClick={() => setSeasons([...seasons, { id: Math.random().toString(36).substring(7), number: seasons.length + 1, episodes: [] }])} className="px-6 py-3 bg-white text-black rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all">Add Season</button>
          </div>
          <div className="space-y-6">
            {seasons.map((season, sIdx) => (
              <div key={season.id} className="p-6 bg-white/[0.03] border border-white/5 rounded-[2rem] space-y-6">
                <div className="flex items-center justify-between">
                  <h4 className="text-base font-black uppercase tracking-widest">Season {season.number}</h4>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => { const s = [...seasons]; s[sIdx].episodes.push({ id: Math.random().toString(36).substring(7), title: `Episode ${s[sIdx].episodes.length + 1}`, description: '', url: '', duration: 0, thumbnailUrl: '', ownerId: auth.currentUser?.uid || 'anonymous', timestamp: Date.now() }); setSeasons(s); }} className="px-4 py-2 bg-white/10 rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-white/20">Add Episode</button>
                    <button type="button" onClick={() => setSeasons(seasons.filter((_, i) => i !== sIdx))} className="text-white/20 hover:text-red-500"><Trash2 size={16} /></button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {season.episodes.map((ep, eIdx) => (
                    <div key={ep.id} className="p-5 bg-black/40 rounded-3xl border border-white/5 space-y-4 group">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Ep</span>
                          <input type="number" value={ep.episodeNumber || eIdx + 1} onChange={(e) => { const s = [...seasons]; s[sIdx].episodes[eIdx].episodeNumber = parseInt(e.target.value); setSeasons(s); }} className="w-10 bg-white/5 border border-white/10 rounded-lg p-1 text-[10px] font-black text-center text-white outline-none" />
                        </div>
                        <button type="button" onClick={() => { const s = [...seasons]; s[sIdx].episodes = s[sIdx].episodes.filter((_, i) => i !== eIdx); setSeasons(s); }} className="text-white/20 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><X size={14} /></button>
                      </div>
                      <input type="text" value={ep.title} onChange={(e) => { const s = [...seasons]; s[sIdx].episodes[eIdx].title = e.target.value; setSeasons(s); }} className="w-full bg-transparent border-none text-xs font-black uppercase tracking-widest text-white outline-none" placeholder="Episode Title" />
                      <textarea value={ep.description || ''} onChange={(e) => { const s = [...seasons]; s[sIdx].episodes[eIdx].description = e.target.value; setSeasons(s); }} placeholder="Episode Description..." className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-[10px] font-medium text-white/60 outline-none resize-none h-16" />
                      <label className="block w-full py-3 bg-white/5 border border-dashed border-white/10 rounded-xl cursor-pointer hover:bg-white/10 text-center transition-all">
                        <span className="text-[8px] font-black uppercase tracking-widest text-white/40">{ep.url ? 'Video Ready' : 'Upload Video'}</span>
                        <input type="file" className="hidden" accept={VIDEO_ACCEPT} onChange={async (e) => { const file = e.target.files?.[0]; if (file) { const url = await uploadFile(file, 'VIDEO'); const s = [...seasons]; s[sIdx].episodes[eIdx].url = url; setSeasons(s); } }} />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Game-specific content form */}
      {type === 'GAME' && (
        <div className="space-y-8">
          {/* Game URL */}
          <div className="p-5 bg-white/5 rounded-2xl border border-white/10 space-y-6">
            <h3 className="text-base font-black uppercase tracking-widest flex items-center gap-3">
              <Globe size={20} className="text-small-orange" /> Game Link
            </h3>
            <div className="space-y-2">
              <label className="block text-[9px] font-black uppercase tracking-widest text-white/40">Web App URL <span className="text-small-orange">*</span></label>
              <input
                type="url"
                value={gameUrl}
                onChange={e => setGameUrl(e.target.value)}
                placeholder="https://your-game.itch.io or https://play.yourgame.com"
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm font-bold text-white outline-none focus:border-small-orange/50 placeholder:text-white/20 transition-all"
              />
              <p className="text-[8px] font-bold uppercase tracking-widest text-white/20">Link to your playable web app — itch.io, GameJolt, or your own URL</p>
            </div>
          </div>

          {/* Game Video / Trailer */}
          <div className="p-5 bg-white/5 rounded-2xl border border-white/10 space-y-6">
            <h3 className="text-base font-black uppercase tracking-widest flex items-center gap-3">
              <VideoIcon size={20} className="text-small-orange" /> Gameplay Video / Trailer
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="block text-[9px] font-black uppercase tracking-widest text-white/40">Video URL (YouTube / Vimeo)</label>
                <input
                  type="url"
                  value={gameVideoUrl}
                  onChange={e => setGameVideoUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                  className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm font-bold text-white outline-none focus:border-small-orange/50 placeholder:text-white/20 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[9px] font-black uppercase tracking-widest text-white/40">Or Upload Video File</label>
                <label className="flex items-center justify-center gap-3 w-full py-4 bg-black/40 border border-dashed border-white/10 rounded-2xl cursor-pointer hover:border-white/20 transition-all group">
                  <Upload size={16} className="text-white/30 group-hover:text-white transition-colors" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-white/40">{gameVideoUrl && !gameVideoUrl.includes('http') ? 'Video Ready' : 'Upload .mp4 / .webm'}</span>
                  <input type="file" className="hidden" accept={VIDEO_ACCEPT} onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) { const url = await uploadFile(file, 'VIDEO'); setGameVideoUrl(url); }
                  }} />
                </label>
              </div>
            </div>
          </div>

          {/* Screenshots */}
          <div className="p-5 bg-white/5 rounded-2xl border border-white/10 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black uppercase tracking-widest flex items-center gap-3">
                <ImageIcon size={20} className="text-small-orange" /> Screenshots
              </h3>
              <label className="px-5 py-2.5 bg-white text-black rounded-xl text-[9px] font-black uppercase tracking-widest cursor-pointer hover:bg-white/90 transition-all">
                Add Screenshots
                <input type="file" className="hidden" accept="image/*" multiple onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  const urls = await Promise.all(files.map(f => uploadFile(f, 'PHOTO')));
                  setGameScreenshots(prev => [...prev, ...urls.filter(Boolean) as string[]]);
                }} />
              </label>
            </div>
            {gameScreenshots.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {gameScreenshots.map((url, i) => (
                  <div key={i} className="relative aspect-video rounded-2xl overflow-hidden group border border-white/5">
                    <img src={url} className="w-full h-full object-cover" alt={`Screenshot ${i + 1}`} />
                    <button
                      type="button"
                      onClick={() => setGameScreenshots(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute top-2 right-2 w-7 h-7 bg-black/70 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                    >
                      <X size={12} className="text-white" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-10 border-2 border-dashed border-white/5 rounded-2xl text-center">
                <p className="text-[9px] font-black uppercase tracking-widest text-white/20">No screenshots yet — add some to showcase your game</p>
              </div>
            )}
          </div>

          {/* Feature Flags */}
          <div className="p-5 bg-white/5 rounded-2xl border border-white/10 space-y-6">
            <h3 className="text-base font-black uppercase tracking-widest flex items-center gap-3">
              <Settings size={20} className="text-small-orange" /> Game Features
            </h3>
            <p className="text-[9px] font-bold uppercase tracking-widest text-white/20">Select all features your game supports</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {GAME_FEATURES.map(({ key, label }) => {
                const active = !!gameFeatures[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setGameFeatures(prev => ({ ...prev, [key]: !prev[key] }))}
                    className={`px-4 py-3 rounded-2xl border text-[9px] font-black uppercase tracking-widest transition-all text-left ${
                      active
                        ? 'bg-small-orange text-white border-small-orange shadow-lg shadow-small-orange/20'
                        : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white/70'
                    }`}
                  >
                    {active ? '✓ ' : ''}{label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Audio/General Upload Drop Zone (non-GAME) */}
      {type !== 'GAME' && (type !== 'VIDEO' || !['MOVIE', 'TV_SERIES'].includes(subType || '')) && contentTab === 'tracks' && (
        <div className="space-y-4">
          {subType === 'MIX' && (
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black uppercase tracking-widest text-white">Mix Source</p>
                  <p className="text-[11px] text-white/50 mt-0.5">Upload a file below, record in DJ Mode, or pull the audio from one of your Reello videos.</p>
                </div>
                <button type="button" onClick={loadReelloVideos} className="shrink-0 flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/15 text-white font-black text-[9px] uppercase tracking-widest rounded-full transition-all">
                  <VideoIcon size={13} /> From Reello
                </button>
              </div>
              {mixSourceKind === 'REELLO' && mixSourceVideoId && (
                <p className="text-[10px] font-black text-[#00DAF3] uppercase tracking-widest">✓ Using audio from a Reello video · audio-only</p>
              )}
              {mixReelloOpen && (
                <div className="pt-1">
                  {mixReelloLoading ? (
                    <p className="text-[11px] text-white/40 uppercase tracking-widest">Loading your Reello videos…</p>
                  ) : mixReelloVideos.length === 0 ? (
                    <p className="text-[11px] text-white/40 uppercase tracking-widest">No Reello videos found on your account.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-64 overflow-y-auto pr-1">
                      {mixReelloVideos.map(v => {
                        const anyV = v as any;
                        const selected = mixSourceVideoId === v.id;
                        const streamedOnly = !v.url;
                        return (
                          <button key={v.id} type="button" onClick={() => pickReelloVideo(v)} disabled={streamedOnly}
                            className={`text-left rounded-xl overflow-hidden border transition-all ${selected ? 'border-[#00DAF3] shadow-lg' : 'border-white/10 hover:border-white/25'} ${streamedOnly ? 'opacity-40 cursor-not-allowed' : ''}`}>
                            <div className="aspect-video bg-white/5">
                              {(anyV.thumbnailUrl || anyV.coverImage) && <img src={anyV.thumbnailUrl || anyV.coverImage} alt="" className="w-full h-full object-cover" />}
                            </div>
                            <p className="text-[10px] font-bold truncate px-2 py-1.5">{v.title || 'Untitled'}{streamedOnly ? ' · streamed' : ''}</p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {subType === 'PODCAST' && (
            <div className="flex items-center justify-between gap-4 p-5 rounded-3xl bg-gradient-to-r from-small-orange/15 to-violet-500/10 border border-small-orange/20">
              <div>
                <p className="text-sm font-black uppercase tracking-widest text-white">Produce live in the Studio</p>
                <p className="text-[11px] text-white/50 mt-1">Record with mic, soundboard, callers + ad-roll — or upload a finished file below.</p>
              </div>
              <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('plajah:open-podcast-studio'))} className="shrink-0 flex items-center gap-2 px-6 py-3 bg-small-orange text-black font-black text-[10px] uppercase tracking-widest rounded-full hover:scale-105 transition-all">
                <Mic2 size={14} /> Produce
              </button>
            </div>
          )}
          {rawFormatNote && (
            <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <span className="text-amber-300 text-sm shrink-0">⚠️</span>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black uppercase tracking-widest text-amber-300 mb-1">Camera-raw format</p>
                <p className="text-[11px] text-white/70 leading-relaxed">{rawFormatNote}</p>
              </div>
              <button onClick={() => setRawFormatNote(null)} className="text-white/30 hover:text-white shrink-0"><X size={14} /></button>
            </div>
          )}
          <div className="relative group">
            <input type="file" multiple accept={type === 'BOOK' ? '.pdf,.epub,.txt,.cbz,.cbr,.docx,.rtf,.fb2,.html,.htm,.mobi,.azw,.azw3,.djvu' : type === 'VIDEO' ? VIDEO_ACCEPT : type === 'PHOTO' ? 'image/*' : AUDIO_ACCEPT} onChange={handleFolderSelect} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
            <div className="w-full py-16 border-2 border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center gap-6 group-hover:bg-white/[0.04] transition-all group-hover:border-white/20">
              <div className="p-6 rounded-2xl bg-white/5 text-white/40 group-hover:text-white transition-all shadow-2xl group-hover:scale-110 duration-500"><Upload size={32} /></div>
              <div className="text-center px-4">
                <p className="text-lg font-black uppercase tracking-widest text-white/60 mb-2">
                  {type === 'BOOK' ? 'Upload Book Files' : type === 'PHOTO' ? 'Upload Photos' : type === 'VIDEO' ? 'Upload Video' : 'Upload Audio Tracks'}
                </p>
                <p className="text-[11px] text-small-orange font-black uppercase tracking-[0.4em] opacity-60">Direct Upload to Google Cloud Storage</p>
                {type === 'BOOK' && (
                  <div className="mt-5 flex flex-wrap justify-center gap-2 max-w-sm mx-auto pointer-events-none">
                    {['EPUB', 'PDF', 'TXT', 'CBZ', 'CBR', 'DOCX', 'RTF', 'FB2', 'HTML', 'MOBI', 'AZW3', 'DJVU'].map(fmt => (
                      <span key={fmt} className="px-2.5 py-1 rounded-full bg-white/5 border border-white/8 text-[8px] font-black uppercase tracking-widest text-white/30">{fmt}</span>
                    ))}
                  </div>
                )}
                {type === 'MUSIC' && (
                  <div className="mt-6 flex flex-col gap-2 items-center max-w-md mx-auto pointer-events-none">
                    <div className="flex items-center gap-2 text-[10px] text-white/40 font-bold uppercase tracking-widest bg-white/5 px-4 py-2 rounded-full border border-white/5"><Info size={12} className="text-blue-400" /><span>Tips for Album Uploads</span></div>
                    <p className="text-[9px] text-white/30 uppercase tracking-widest leading-relaxed text-center">Include an <strong className="text-white/60">XML or M3U playlist file</strong> to auto-sort track order.<br />Embedded <strong className="text-white/60">ID3 tags</strong> in MP3s will be scanned for titles.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Book chapters list */}
      {type === 'BOOK' && isPaywalled && (
        <div className="p-5 bg-white/[0.03] border border-white/10 rounded-3xl space-y-6">
          <h4 className="text-xs font-black uppercase tracking-widest">Preview Configuration</h4>
          <div className="flex gap-4">
            <button type="button" onClick={() => setBookPreviewConfig({ ...bookPreviewConfig, type: 'PAGES' })} className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${bookPreviewConfig.type === 'PAGES' ? 'bg-small-orange text-white border-small-orange' : 'bg-white/5 border-white/10 text-white/40'}`}>By Page Range</button>
            <button type="button" onClick={() => setBookPreviewConfig({ ...bookPreviewConfig, type: 'CHAPTERS' })} className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${bookPreviewConfig.type === 'CHAPTERS' ? 'bg-small-orange text-white border-small-orange' : 'bg-white/5 border-white/10 text-white/40'}`}>By Chapters</button>
          </div>
          {bookPreviewConfig.type === 'PAGES' && (
            <div className="flex items-center gap-4">
              <div className="flex-1 space-y-2">
                <label className="text-[9px] font-black uppercase tracking-widest text-white/20">Start Page</label>
                <input type="number" value={bookPreviewConfig.allowedPageRange?.[0] || 1} onChange={(e) => setBookPreviewConfig({ ...bookPreviewConfig, allowedPageRange: [parseInt(e.target.value), bookPreviewConfig.allowedPageRange?.[1] || 5] })} className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs font-bold text-white focus:outline-none" />
              </div>
              <div className="flex-1 space-y-2">
                <label className="text-[9px] font-black uppercase tracking-widest text-white/20">End Page</label>
                <input type="number" value={bookPreviewConfig.allowedPageRange?.[1] || 5} onChange={(e) => setBookPreviewConfig({ ...bookPreviewConfig, allowedPageRange: [bookPreviewConfig.allowedPageRange?.[0] || 1, parseInt(e.target.value)] })} className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs font-bold text-white focus:outline-none" />
              </div>
            </div>
          )}
        </div>
      )}

      {type === 'BOOK' && (
        <div className="p-6 rounded-3xl bg-white/[0.03] border border-white/5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-black uppercase tracking-widest text-white/70">Allow Page Sharing</h4>
              <p className="text-[9px] font-black uppercase tracking-widest text-white/25 mt-0.5">Readers can share individual pages to their Plajah feed</p>
            </div>
            <button
              type="button"
              onClick={() => setAllowPageSharing(!allowPageSharing)}
              className={`w-14 h-7 rounded-full transition-all duration-300 relative ${allowPageSharing ? 'bg-small-orange' : 'bg-white/10'}`}
            >
              <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300 ${allowPageSharing ? 'left-8' : 'left-1'}`} />
            </button>
          </div>
        </div>
      )}

      {type === 'BOOK' && bookChapters.length > 0 && (
        <div className="space-y-4 max-h-[500px] overflow-y-auto pr-4 custom-scrollbar">
          {bookChapters.map((chapter, i) => (
            <div key={chapter.id} className="flex flex-col gap-4 p-5 rounded-2xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.05] transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 overflow-hidden flex-1">
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-[11px] font-black text-small-orange border border-white/10 shrink-0">{i + 1}</div>
                  {chapter.format && (
                    <span className={`shrink-0 px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                      chapter.format === 'EPUB' ? 'bg-[#D0BCFF]/10 text-[#D0BCFF] border-[#D0BCFF]/20' :
                      chapter.format === 'PDF' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                      chapter.format === 'COMIC' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' :
                      chapter.format === 'MOBI' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                      chapter.format === 'HTML' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                      'bg-white/5 text-white/30 border-white/10'
                    }`}>{chapter.format}</span>
                  )}
                  <div className="group/ct relative flex-1 min-w-0">
                    <input type="text" value={chapter.title} onChange={(e) => setBookChapters(bookChapters.map(c => c.id === chapter.id ? { ...c, title: e.target.value } : c))} className="w-full min-w-0 bg-transparent text-xl font-display font-black uppercase tracking-tight text-white placeholder:text-white/25 rounded-lg pr-7 py-1 border-b border-dashed border-white/20 hover:border-white/40 focus:border-small-orange focus:outline-none transition-all" placeholder="Chapter title" />
                    <Pencil size={12} className="absolute right-1 top-1/2 -translate-y-1/2 text-white/25 group-hover/ct:text-small-orange group-focus-within/ct:text-small-orange pointer-events-none transition-colors" />
                  </div>
                </div>
                <button type="button" onClick={() => setBookChapters(bookChapters.filter(c => c.id !== chapter.id))} className="p-4 text-white/20 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-all"><X size={20} /></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/20">Chapter Price ($)</label>
                  <input type="number" step="0.01" value={chapter.price || 0} onChange={(e) => setBookChapters(bookChapters.map(c => c.id === chapter.id ? { ...c, price: parseFloat(e.target.value) } : c))} className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs font-bold text-white focus:outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/20">Paywall Status</label>
                  <button type="button" onClick={() => setBookChapters(bookChapters.map(c => c.id === chapter.id ? { ...c, isPaywalled: !c.isPaywalled } : c))} className={`w-full py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${chapter.isPaywalled ? 'bg-small-orange text-white border-small-orange' : 'bg-white/5 border-white/10 text-white/40'}`}>{chapter.isPaywalled ? 'Paywalled' : 'Free to Read'}</button>
                </div>
              </div>
              {bookPreviewConfig.type === 'CHAPTERS' && isPaywalled && (
                <button type="button" onClick={() => { const allowed = bookPreviewConfig.allowedChapterIds || []; setBookPreviewConfig({ ...bookPreviewConfig, allowedChapterIds: allowed.includes(chapter.id) ? allowed.filter(id => id !== chapter.id) : [...allowed, chapter.id] }); }} className={`w-full py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${(bookPreviewConfig.allowedChapterIds || []).includes(chapter.id) ? 'bg-green-500/20 text-green-400 border-green-500/40' : 'bg-white/5 border-white/10 text-white/40'}`}>{(bookPreviewConfig.allowedChapterIds || []).includes(chapter.id) ? 'Included in Preview' : 'Add to Preview'}</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Track list + Order — unified scroll container */}
      {type !== 'BOOK' && tracks.length > 0 && contentTab === 'tracks' && (
        <div className="max-h-[62vh] overflow-y-auto track-scrollbar space-y-5 -mr-3 pr-3">
          {/* Affordance hint */}
          {tracks.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 rounded-2xl" style={{ background: 'rgba(255,140,0,0.06)', border: '1px solid rgba(255,140,0,0.14)' }}>
              <span className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-white/40"><ChevronUp size={10} className="text-small-orange -mr-1" /><ChevronDown size={10} className="text-small-orange" />Use ↑ ↓ on each track to reorder</span>
              <span className="text-white/15">·</span>
              <span className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-white/40"><RefreshCw size={10} className="text-small-orange" />Replace file</span>
              <span className="text-white/15">·</span>
              <span className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-white/40"><Play size={10} className="text-small-orange" />Preview audio</span>
              <span className="text-white/15">·</span>
              <span className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-white/40"><ShieldCheck size={10} className="text-small-orange" />Run QC before publishing</span>
            </div>
          )}
          {tracks.map((track, i) => (
            <div key={track.id} className={`flex flex-col gap-4 p-5 rounded-2xl border transition-all ${previewingId === track.id ? 'bg-green-500/5 border-green-500/20' : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.05]'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-5 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-small-orange border border-white/10 shrink-0">{track.mediaKind === 'VIDEO' ? <Film size={15} /> : <span className="text-[11px] font-black">{i + 1}</span>}</div>
                  {track.mediaKind === 'VIDEO' && <span className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-full bg-blue-500/15 text-blue-300 text-[8px] font-black uppercase tracking-widest border border-blue-500/20"><Film size={9} /> Video</span>}
                  <div className="group/tt relative flex-1 min-w-0">
                    <input type="text" value={track.title} onChange={(e) => updateTrack(track.id, { title: e.target.value })} className="w-full min-w-0 bg-transparent text-xl font-display font-black uppercase tracking-tight text-white placeholder:text-white/25 rounded-lg pr-7 py-1 border-b border-dashed border-white/20 hover:border-white/40 focus:border-small-orange focus:outline-none transition-all" placeholder="Track title" />
                    <Pencil size={12} className="absolute right-1 top-1/2 -translate-y-1/2 text-white/25 group-hover/tt:text-small-orange group-focus-within/tt:text-small-orange pointer-events-none transition-colors" />
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {/* Reorder — obvious up/down arrows (touch-friendly; no drag needed) */}
                  {tracks.length > 1 && (
                    <div className="flex flex-col mr-1 shrink-0 rounded-lg bg-small-orange/[0.07] border border-small-orange/20">
                      <button type="button" disabled={i === 0} onClick={() => moveTrack(i, -1)} title="Move track up"
                        className="px-1 pt-0.5 rounded-t-lg text-small-orange/80 hover:text-small-orange hover:bg-small-orange/15 disabled:opacity-20 disabled:hover:bg-transparent transition-all"><ChevronUp size={15} /></button>
                      <button type="button" disabled={i === tracks.length - 1} onClick={() => moveTrack(i, 1)} title="Move track down"
                        className="px-1 pb-0.5 rounded-b-lg text-small-orange/80 hover:text-small-orange hover:bg-small-orange/15 disabled:opacity-20 disabled:hover:bg-transparent transition-all"><ChevronDown size={15} /></button>
                    </div>
                  )}
                  {/* Preview — inline video player for video tracks, audio scrub otherwise */}
                  {track.mediaKind === 'VIDEO' ? (
                    <button type="button" onClick={() => setPreviewVideoId(id => id === track.id ? null : track.id)} title={previewVideoId === track.id ? 'Hide preview' : 'Play video preview'} className={`p-3 rounded-full transition-all ${previewVideoId === track.id ? 'text-green-400 bg-green-500/10' : 'text-white/20 hover:text-green-400 hover:bg-green-400/10'}`}>
                      {previewVideoId === track.id ? <Square size={15} className="fill-green-400" /> : <Play size={15} />}
                    </button>
                  ) : (
                    <button type="button" onClick={() => togglePreview(track)} title={previewingId === track.id ? 'Stop preview' : 'Preview audio'} className={`p-3 rounded-full transition-all ${previewingId === track.id ? 'text-green-400 bg-green-500/10' : 'text-white/20 hover:text-green-400 hover:bg-green-400/10'}`}>
                      {previewingId === track.id ? <Square size={15} className="fill-green-400" /> : <Play size={15} />}
                    </button>
                  )}
                  {/* Verify (video) */}
                  {track.mediaKind === 'VIDEO' && (
                    <button type="button" title="Verify video (QC)" onClick={async () => {
                      setQcResults(prev => ({ ...prev, [track.id]: { status: 'running' } }));
                      const r = await runQcForTrack(track);
                      setQcResults(prev => ({ ...prev, [track.id]: r }));
                    }} className="p-3 rounded-full text-white/20 hover:text-small-orange hover:bg-small-orange/10 transition-all"><ShieldCheck size={15} /></button>
                  )}
                  {/* Replace file */}
                  <label title="Replace file" className="p-3 rounded-full text-white/20 hover:text-small-orange hover:bg-small-orange/10 transition-all cursor-pointer">
                    <RefreshCw size={15} />
                    <input type="file" className="hidden" accept={track.mediaKind === 'VIDEO' ? VIDEO_ACCEPT : AUDIO_ACCEPT} onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) { stopPreview(); setPreviewVideoId(null); updateTrack(track.id, { file, url: URL.createObjectURL(file), mediaKind: file.type.startsWith('video') ? 'VIDEO' : track.mediaKind }); setQcResults(prev => { const n = { ...prev }; delete n[track.id]; return n; }); }
                      e.target.value = '';
                    }} />
                  </label>
                  {/* Delete */}
                  <button type="button" onClick={() => { stopPreview(); setTracks(tracks.filter(t => t.id !== track.id)); }} className="p-3 text-white/20 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-all"><Trash2 size={15} /></button>
                </div>
              </div>
              {/* QC status inline badge if run */}
              {qcResults[track.id] && qcResults[track.id].status !== 'running' && (
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest ${
                  qcResults[track.id].status === 'pass' ? 'bg-green-500/10 border border-green-500/25 text-green-400' :
                  qcResults[track.id].status === 'warn' ? 'bg-yellow-500/10 border border-yellow-500/25 text-yellow-400' :
                  'bg-red-500/10 border border-red-500/25 text-red-400'
                }`}>
                  {qcResults[track.id].status === 'pass' ? <ShieldCheck size={10} /> : qcResults[track.id].status === 'warn' ? <AlertTriangle size={10} /> : <ShieldX size={10} />}
                  {qcResults[track.id].issue || (qcResults[track.id].status === 'pass' ? `Pass — ${(qcResults[track.id].duration || 0).toFixed(1)}s, peak ${((qcResults[track.id].peak || 0) * 100).toFixed(0)}%` : '')}
                </div>
              )}
              {qcResults[track.id]?.status === 'running' && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 text-[8px] font-black uppercase tracking-widest text-white/40">
                  <Loader2 size={10} className="animate-spin" /> Analyzing…
                </div>
              )}
              {/* Inline video preview / playback */}
              {track.mediaKind === 'VIDEO' && previewVideoId === track.id && track.url && (
                <div className="rounded-2xl overflow-hidden border border-white/10 bg-black">
                  <video src={track.url} controls playsInline className="w-full max-h-[42vh] bg-black" />
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/20">Price ($)</label>
                  <input type="number" step="0.01" value={track.price || 0} onChange={(e) => updateTrack(track.id, { price: parseFloat(e.target.value) })} className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-[10px] font-bold text-white outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/20">Options</label>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => updateTrack(track.id, { isPaywalled: !track.isPaywalled })} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${track.isPaywalled ? 'bg-small-orange text-white border-small-orange shadow-lg' : 'bg-white/5 border-white/10 text-white/40'}`}>{track.isPaywalled ? 'Paywall' : 'Free'}</button>
                    <button type="button" onClick={() => updateTrack(track.id, { isRadioEligible: !track.isRadioEligible })} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${track.isRadioEligible ? 'bg-green-500 text-white border-green-500' : 'bg-white/5 border-white/10 text-white/40'}`}>Radio</button>
                    <button type="button" onClick={() => updateTrack(track.id, { isSlideshowEligible: !track.isSlideshowEligible })} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${track.isSlideshowEligible ? 'bg-blue-500 text-white border-blue-500' : 'bg-white/5 border-white/10 text-white/40'}`}>Slide</button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/20">Asset Linking</label>
                  <select value={track.videoId || ''} onChange={(e) => updateTrack(track.id, { videoId: e.target.value })} className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-[10px] font-bold text-white outline-none appearance-none">
                    <option value="">No Video Linked</option>
                    {musicVideos.map(v => <option key={v.id} value={v.id}>{v.title}</option>)}
                  </select>
                </div>
              </div>
              {licensingEnabled && type === 'MUSIC' && (
                <div className="mt-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-white/20">Sync license fee ($)</label>
                    <input type="number" step="1" min="0" value={track.syncLicenseFee || 0} onChange={(e) => updateTrack(track.id, { syncLicenseFee: parseFloat(e.target.value) || 0 })} className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-[10px] font-bold text-white outline-none" placeholder="0 = not offered" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-white/20">Sync license terms</label>
                    <input type="text" value={track.syncLicenseTerms || ''} onChange={(e) => updateTrack(track.id, { syncLicenseTerms: e.target.value })} className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-[10px] font-bold text-white outline-none" placeholder="e.g. Worldwide, perpetual, non-exclusive — one film per license" />
                  </div>
                  <div className="md:col-span-3 text-[8px] text-white/25 leading-relaxed">Filmmakers can license this track for a project in Fabula at this flat fee — it routes to you (minus a 10% platform fee) via your connected Stripe account. Leave $0 to keep it unavailable for sync.</div>
                </div>
              )}
              {type === 'MUSIC' && (
                <>
                  {/* ── Lyrics ── */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[9px] font-black uppercase tracking-widest text-white/20">Lyrics</label>
                      <button type="button" onClick={async () => { setStatus({ text: `Generating lyrics…`, percent: 40 }); const lyricsArr = await (await import('../services/geminiService')).generateTrackLyrics(track.title, artist); updateTrack(track.id, { lyrics: lyricsArr.join('\n') }); setStatus({ text: '', percent: 0 }); }} className="flex items-center gap-2 text-[8px] font-black uppercase tracking-widest text-small-orange hover:text-white transition-colors"><Sparkles size={10} /> Generate AI</button>
                    </div>
                    <textarea
                      value={track.lyrics || ''}
                      onChange={(e) => {
                        const lyrics = e.target.value;
                        // Keep synced captions in step with corrections typed here — the album
                        // page reads the captions, not this box.
                        updateTrack(track.id, { lyrics, ...(reconcileTimedLyricText(track, lyrics) || {}) });
                      }}
                      placeholder="Paste or write lyrics here — each line becomes a caption…"
                      className="w-full bg-black/40 border border-white/5 rounded-2xl p-5 text-[11px] font-medium text-white/80 outline-none h-28 resize-none focus:border-white/20 transition-colors"
                    />
                  </div>

                  {/* ── Caption Sync card ── discoverable, always visible when there are lyrics */}
                  {(() => {
                    const hasSynced = (track.timeCodedLyrics?.length ?? 0) > 0;
                    const hasLyrics = !!track.lyrics?.trim();
                    // Transcribed lines exist but nothing has been pasted into the lyrics box —
                    // this is the case that used to lock manual syncing out entirely.
                    const transcriptOnly = hasSynced && !hasLyrics;
                    // Words in the lyrics box no longer match the synced captions the album
                    // page actually displays. 'text' is alignable by line order; 'count' isn't.
                    const drift = timedLyricDrift(track);
                    const canSync = hasLyrics || hasSynced;
                    const fmtT = (s: number) => { const m = Math.floor(s / 60); const ss = Math.floor(s % 60); return `${m}:${ss.toString().padStart(2,'0')}`; };
                    const fmtExact = (s: number) => { const m = Math.floor(s / 60); const ss = (s % 60).toFixed(1).padStart(4, '0'); return `${m}:${ss}`; };
                    const parseT = (v: string): number => {
                      const t = v.trim();
                      if (t.includes(':')) { const [m, s] = t.split(':'); return (parseInt(m, 10) || 0) * 60 + (parseFloat(s) || 0); }
                      return parseFloat(t);
                    };
                    return (
                      <div className={`rounded-2xl border overflow-hidden transition-all ${hasSynced ? 'border-small-orange/25 bg-small-orange/[0.04]' : 'border-white/[0.08] bg-white/[0.02]'}`}>
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${hasSynced ? 'bg-small-orange/20' : 'bg-white/5'}`}>
                              {hasSynced
                                ? <Check size={13} className="text-small-orange" />
                                : <Mic2 size={13} className="text-white/25" />
                              }
                            </div>
                            <div>
                              <p className="text-[9px] font-black uppercase tracking-widest text-white">Caption Sync</p>
                              <p className="text-[8px] text-white/30 mt-0.5">
                                {transcriptOnly
                                  ? `${track.timeCodedLyrics!.length} transcribed lines — edit times below, or import them to correct the words`
                                  : hasSynced
                                    ? `${track.timeCodedLyrics!.length} lines synced — edit times below, or re-sync`
                                    : hasLyrics
                                      ? 'Auto-sync will run on publish · or tap to sync manually'
                                      : 'Add lyrics above, or run a transcription, to unlock caption sync'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {transcriptOnly && (
                              <button
                                type="button"
                                onClick={() => importTranscription(track)}
                                title="Copy the transcribed words into the lyrics box so you can correct them"
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/8 border border-white/15 text-white/70 rounded-full text-[8px] font-black uppercase tracking-widest hover:bg-white/15 active:scale-95 transition-all"
                              >
                                <Mic2 size={10} /> Import Transcript
                              </button>
                            )}
                            {canSync && (
                              <button
                                type="button"
                                onClick={() => openTapSync(track)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-small-orange/15 border border-small-orange/30 text-small-orange rounded-full text-[8px] font-black uppercase tracking-widest hover:bg-small-orange/25 active:scale-95 transition-all"
                              >
                                <Mic2 size={10} /> {hasSynced ? 'Re-sync' : 'Tap to Sync'}
                              </button>
                            )}
                          </div>
                        </div>
                        {/* Existing synced lines preview */}
                        {hasSynced && (
                          <div className="px-4 pb-3 max-h-56 overflow-y-auto custom-scrollbar">
                            <div className="border-t border-white/[0.06] pt-2">
                              <p className="text-[7px] font-black uppercase tracking-[0.25em] text-white/25 mb-1.5">
                                Timestamps — nudge or type to correct
                              </p>
                              {/* The album page shows these captions, not the lyrics box — say so
                                  plainly when the two have drifted, and offer the safe fix. */}
                              {drift !== 'none' && (
                                <div className="mb-2 px-2.5 py-2 rounded-lg bg-amber-500/[0.07] border border-amber-500/25 space-y-1.5">
                                  <p className="text-[8px] text-amber-200/80 font-bold leading-relaxed">
                                    {drift === 'count'
                                      ? `Your lyrics have ${(track.lyrics || '').split('\n').filter(l => l.trim()).length} lines but there are ${track.timeCodedLyrics!.length} timed captions. Line counts must match to carry the words over — re-sync to retime.`
                                      : 'These captions still show the old words. The album page plays these, not the lyrics box.'}
                                  </p>
                                  {drift === 'text' && (
                                    <button
                                      type="button"
                                      onClick={() => applyLyricsToTimings(track)}
                                      className="px-2.5 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/35 text-amber-100 text-[7.5px] font-black uppercase tracking-widest transition-colors"
                                    >
                                      Apply my lyrics to these timings
                                    </button>
                                  )}
                                </div>
                              )}
                              <div className="space-y-0.5">
                                {track.timeCodedLyrics!.map((l, i) => (
                                  <div key={i} className="flex items-center gap-1.5 group/line rounded-lg px-1 py-0.5 hover:bg-white/[0.04]">
                                    <button
                                      type="button"
                                      onClick={() => nudgeLyricTime(track, i, -0.1)}
                                      title="0.1s earlier"
                                      className="w-5 h-5 shrink-0 rounded-md bg-white/5 text-white/35 hover:text-white hover:bg-white/12 text-[10px] font-black leading-none transition-all"
                                    >−</button>
                                    <input
                                      type="text"
                                      defaultValue={fmtExact(l.time)}
                                      onBlur={e => { const v = parseT(e.target.value); if (isFinite(v)) setLyricTime(track, i, v); else e.target.value = fmtExact(l.time); }}
                                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                                      title="m:ss.s — or plain seconds"
                                      className="w-14 shrink-0 bg-black/40 border border-white/10 focus:border-small-orange/50 rounded-md px-1 py-0.5 text-[8px] font-mono text-small-orange text-center tabular-nums outline-none"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => nudgeLyricTime(track, i, 0.1)}
                                      title="0.1s later"
                                      className="w-5 h-5 shrink-0 rounded-md bg-white/5 text-white/35 hover:text-white hover:bg-white/12 text-[10px] font-black leading-none transition-all"
                                    >+</button>
                                    <span className="text-[8px] text-white/50 truncate flex-1 min-w-0">{l.text}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                        {/* Auto-sync badge when lyrics exist but no sync yet */}
                        {!hasSynced && hasLyrics && (
                          <div className="mx-4 mb-3 flex items-center gap-2 px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                            <Sparkles size={10} className="text-small-orange/50 shrink-0" />
                            <p className="text-[7.5px] text-white/30 font-bold">Captions auto-generated from lyrics when you publish — no extra work needed</p>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* ── Artist Notes ── */}
                  <div className="space-y-3">
                    <label className="text-[9px] font-black uppercase tracking-widest text-white/20">Artist Notes (one per line)</label>
                    <textarea value={track.artistNotes?.join('\n') || ''} onChange={(e) => updateTrack(track.id, { artistNotes: e.target.value.split('\n').filter(n => n.trim() !== '') })} placeholder="Notes for your fans…" className="w-full bg-white/[0.04] border border-white/10 rounded-2xl px-6 py-4 text-white text-xs font-medium focus:outline-none h-20 resize-none" />
                  </div>
                </>
              )}
            </div>
          ))}

          {/* Track Order Arrangement */}
          {tracks.length > 1 && (
            <div className="p-5 bg-white/[0.03] border border-white/10 rounded-3xl space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-2xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                  <GripVertical size={20} className="text-small-orange" />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-widest">Arrange Track Order</h4>
                  <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest mt-1">Drag or use arrows to reorder tracks</p>
                </div>
              </div>
              <div className="space-y-2">
                {tracks.map((track, i) => (
                  <div
                    key={track.id}
                    draggable
                    onDragStart={() => { dragIndexRef.current = i; }}
                    onDragOver={(e) => { e.preventDefault(); setDragOverIndex(i); }}
                    onDragLeave={() => setDragOverIndex(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = dragIndexRef.current;
                      setDragOverIndex(null);
                      if (from === null || from === i) return;
                      const reordered = [...tracks];
                      const [moved] = reordered.splice(from, 1);
                      reordered.splice(i, 0, moved);
                      setTracks(reordered);
                      dragIndexRef.current = null;
                    }}
                    onDragEnd={() => { dragIndexRef.current = null; setDragOverIndex(null); }}
                    className={`flex items-center gap-4 p-4 rounded-2xl border transition-all cursor-grab active:cursor-grabbing select-none ${
                      dragOverIndex === i
                        ? 'bg-small-orange/10 border-small-orange/40 scale-[1.01]'
                        : 'bg-white/[0.04] border-white/5 hover:bg-white/[0.07]'
                    }`}
                  >
                    <GripVertical size={16} className="text-white/20 shrink-0" />
                    <span className="w-8 text-center text-[10px] font-black text-small-orange shrink-0">{i + 1}</span>
                    <span className="flex-1 text-sm font-black uppercase tracking-wide text-white truncate">{track.title || 'Untitled'}</span>
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => {
                          const reordered = [...tracks];
                          [reordered[i - 1], reordered[i]] = [reordered[i], reordered[i - 1]];
                          setTracks(reordered);
                        }}
                        className="p-1.5 text-white/30 hover:text-white disabled:opacity-20 transition-colors rounded-lg hover:bg-white/10"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        type="button"
                        disabled={i === tracks.length - 1}
                        onClick={() => {
                          const reordered = [...tracks];
                          [reordered[i + 1], reordered[i]] = [reordered[i], reordered[i + 1]];
                          setTracks(reordered);
                        }}
                        className="p-1.5 text-white/30 hover:text-white disabled:opacity-20 transition-colors rounded-lg hover:bg-white/10"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Audio Health tab */}
      {(type === 'MUSIC' || (type === 'VIDEO' && !['MOVIE', 'TV_SERIES'].includes(subType || ''))) && contentTab === 'audio_health' && (
        <AudioHealthPanel
          albums={initialAlbum ? [{ ...initialAlbum, tracks }] : tracks.some(t => t.url) ? [{
            id: 'draft',
            title: title || 'Draft',
            coverImage,
            tracks,
            type: 'MUSIC' as const,
            artistName: '',
            uid: '',
            timestamp: Date.now(),
            isPublic: false,
          } as any] : []}
        />
      )}

      {/* Quality Control tab */}
      {(type === 'MUSIC' || (type === 'VIDEO' && !['MOVIE', 'TV_SERIES'].includes(subType || ''))) && contentTab === 'quality' && (
        <div className="space-y-5 animate-in fade-in duration-300">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-green-400" />
                <h3 className="text-base font-black uppercase tracking-widest">Quality Control</h3>
              </div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/30 leading-relaxed">
                Analyzes each audio file in-browser — checks for empty files, silence, clipping, and decode errors. Run before publishing to catch problems before listeners do.
              </p>
            </div>
            <button
              type="button"
              disabled={isQcRunning || tracks.filter(t => t.url).length === 0}
              onClick={runAllQc}
              className="shrink-0 flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-[9px] uppercase tracking-widest transition-all hover:scale-105 active:scale-95 disabled:opacity-40"
              style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80' }}
            >
              {isQcRunning ? <><Loader2 size={12} className="animate-spin" />Analyzing…</> : <><ShieldCheck size={12} />Run All Checks</>}
            </button>
          </div>

          {/* Per-track results */}
          {tracks.filter(t => t.url).length === 0 ? (
            <div className="py-16 border-2 border-dashed border-white/5 rounded-3xl text-center">
              <ShieldCheck size={24} className="mx-auto mb-3 text-white/10" />
              <p className="text-[9px] font-black uppercase tracking-widest text-white/20">No audio tracks yet — add tracks in the Audio Tracks tab first</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tracks.filter(t => t.url).map((track, i) => {
                const qc = qcResults[track.id];
                return (
                  <div key={track.id} className={`p-4 rounded-2xl border transition-all ${
                    !qc ? 'bg-white/[0.03] border-white/5' :
                    qc.status === 'running' ? 'bg-white/[0.03] border-white/10' :
                    qc.status === 'pass' ? 'bg-green-500/5 border-green-500/20' :
                    qc.status === 'warn' ? 'bg-yellow-500/5 border-yellow-500/20' :
                    'bg-red-500/5 border-red-500/20'
                  }`}>
                    <div className="flex items-center gap-3">
                      {/* Status icon */}
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        !qc ? 'bg-white/5 text-white/20' :
                        qc.status === 'running' ? 'bg-white/5 text-white/40' :
                        qc.status === 'pass' ? 'bg-green-500/20 text-green-400' :
                        qc.status === 'warn' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {!qc && <ShieldCheck size={14} />}
                        {qc?.status === 'running' && <Loader2 size={14} className="animate-spin" />}
                        {qc?.status === 'pass' && <ShieldCheck size={14} />}
                        {qc?.status === 'warn' && <AlertTriangle size={14} />}
                        {qc?.status === 'fail' && <ShieldX size={14} />}
                      </div>
                      {/* Track info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black text-small-orange shrink-0">{i + 1}</span>
                          <p className="text-[11px] font-black uppercase tracking-wide text-white truncate">{track.title || 'Untitled'}</p>
                        </div>
                        {qc && qc.status !== 'running' && (
                          <p className={`text-[9px] font-bold mt-0.5 ${
                            qc.status === 'pass' ? 'text-green-400/80' : qc.status === 'warn' ? 'text-yellow-400/80' : 'text-red-400/80'
                          }`}>
                            {qc.issue || (qc.status === 'pass' ? `OK — ${(qc.duration || 0).toFixed(1)}s · peak ${((qc.peak || 0) * 100).toFixed(0)}% · RMS ${((qc.rms || 0) * 100).toFixed(1)}%` : '')}
                          </p>
                        )}
                        {qc?.status === 'running' && <p className="text-[9px] font-bold text-white/30 mt-0.5">Analyzing audio…</p>}
                        {!qc && <p className="text-[9px] font-bold text-white/20 mt-0.5">Not checked yet — click Run All Checks</p>}
                      </div>
                      {/* Per-track recheck */}
                      {qc && qc.status !== 'running' && (
                        <button type="button" onClick={async () => {
                          setQcResults(prev => ({ ...prev, [track.id]: { status: 'running' } }));
                          const result = await runQcForTrack(track);
                          setQcResults(prev => ({ ...prev, [track.id]: result }));
                        }} className="shrink-0 p-2 rounded-xl text-white/20 hover:text-white hover:bg-white/5 transition-all" title="Re-check this track">
                          <RefreshCw size={12} />
                        </button>
                      )}
                      {/* Replace if failed */}
                      {qc?.status === 'fail' && (
                        <label className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest cursor-pointer transition-all hover:scale-105"
                          style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
                          <Upload size={10} /> Replace
                          <input type="file" className="hidden" accept={AUDIO_ACCEPT} onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) { updateTrack(track.id, { file, url: URL.createObjectURL(file) }); setQcResults(prev => { const n = { ...prev }; delete n[track.id]; return n; }); }
                            e.target.value = '';
                          }} />
                        </label>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Summary */}
          {Object.keys(qcResults).length > 0 && !isQcRunning && (() => {
            const vals = Object.values(qcResults);
            const fails = vals.filter(r => r.status === 'fail').length;
            const warns = vals.filter(r => r.status === 'warn').length;
            const passes = vals.filter(r => r.status === 'pass').length;
            return (
              <div className={`flex items-center gap-3 p-4 rounded-2xl text-[9px] font-black uppercase tracking-widest ${
                fails > 0 ? 'bg-red-500/10 border border-red-500/25 text-red-400' :
                warns > 0 ? 'bg-yellow-500/10 border border-yellow-500/25 text-yellow-400' :
                'bg-green-500/10 border border-green-500/25 text-green-400'
              }`}>
                {fails > 0 ? <ShieldX size={14} /> : warns > 0 ? <AlertTriangle size={14} /> : <ShieldCheck size={14} />}
                <span>
                  {fails > 0 ? `${fails} track${fails > 1 ? 's' : ''} failed QC — fix before publishing` :
                   warns > 0 ? `${warns} warning${warns > 1 ? 's' : ''} — review before publishing` :
                   `All ${passes} track${passes > 1 ? 's' : ''} passed quality check`}
                </span>
              </div>
            );
          })()}
        </div>
      )}

      {/* Music Videos & BTS section */}
      {(type === 'MUSIC' || (type === 'VIDEO' && !['MOVIE', 'TV_SERIES'].includes(subType || ''))) && contentTab === 'videos' && (
        <div className="p-5 sm:p-6 bg-white/[0.03] border border-white/10 rounded-3xl space-y-5">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shrink-0"><VideoIcon size={20} className="text-blue-500" /></div>
            <div className="min-w-0">
              <h4 className="text-xs font-black uppercase tracking-widest">Music Videos &amp; BTS Clips</h4>
              <p className="text-[9px] font-bold text-white/40 tracking-wide mt-1 leading-relaxed normal-case">
                Upload music videos <span className="text-white/60">and</span> behind-the-scenes clips for this album — the official visual, studio sessions, lyric videos, anything.{type === 'MUSIC' ? ' They can also post to Reello for more reach (toggle in the final step).' : ''}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-3">
              <label className="text-[9px] font-black uppercase tracking-widest text-white/20">Video Title</label>
              <input type="text" value={newVideoTitle} onChange={(e) => setNewVideoTitle(e.target.value)} placeholder="Cinematic Visual" className="w-full bg-white/[0.04] border border-white/10 rounded-2xl px-6 py-4 text-white font-bold focus:outline-none focus:ring-4 focus:ring-white/5 transition-all placeholder:text-white/10" />
            </div>
            <div className="space-y-3">
              <label className="text-[9px] font-black uppercase tracking-widest text-white/20">Video Source</label>
              <div className="flex gap-3">
                <input type="url" value={newVideoUrl} onChange={(e) => setNewVideoUrl(e.target.value)} placeholder="YouTube/Vimeo URL" className="flex-1 bg-white/[0.04] border border-white/10 rounded-2xl px-6 py-4 text-white font-bold focus:outline-none transition-all placeholder:text-white/10" />
                <label className="p-4 bg-white/5 rounded-2xl cursor-pointer hover:bg-white/10 transition-all flex items-center justify-center">
                  <Upload size={20} className="text-white/40" />
                  <input type="file" className="hidden" accept={VIDEO_ACCEPT} onChange={(e) => { const f = e.target.files?.[0]; if (f) { setNewVideoFile(f); setNewVideoUrl(f.name); } }} />
                </label>
              </div>
            </div>
          </div>
          <div className="flex flex-col md:flex-row items-center gap-4">
            <label className="flex-1 w-full flex items-center gap-4 p-4 bg-white/5 border border-dashed border-white/10 rounded-2xl cursor-pointer hover:bg-white/10 transition-all">
              <ImageIcon size={18} className="text-white/40 shrink-0" />
              <span className="text-[10px] font-black text-white/30 uppercase tracking-widest truncate">{newVideoThumb ? newVideoThumb.name : 'Thumbnail (Optional)'}</span>
              <input type="file" className="hidden" accept="image/*" onChange={(e) => setNewVideoThumb(e.target.files?.[0])} />
            </label>
            <label className="flex-1 w-full flex items-center gap-4 p-4 bg-white/5 border border-dashed border-white/10 rounded-2xl cursor-pointer hover:bg-white/10 transition-all">
              <ImageIcon size={18} className="text-white/40 shrink-0" />
              <span className="text-[10px] font-black text-white/30 uppercase tracking-widest truncate">{newVideoCover ? newVideoCover.name : 'Cover (Optional)'}</span>
              <input type="file" className="hidden" accept="image/*" onChange={(e) => setNewVideoCover(e.target.files?.[0])} />
            </label>
            <button type="button" disabled={!newVideoFile || isCapturing} onClick={async () => { if (!newVideoFile) return; setIsCapturing(true); try { const blob = await captureVideoFrame(newVideoFile); const f = new File([blob], 'thumb.jpg', { type: 'image/jpeg' }); setNewVideoThumb(f); setNewVideoCover(f); } catch {} finally { setIsCapturing(false); } }} className="p-4 bg-white/5 rounded-2xl text-white/40 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30" title="Auto-capture from video"><Camera size={20} /></button>
            <button type="button" onClick={async () => {
              if (!newVideoTitle || (!newVideoUrl && !newVideoFile)) return;
              let finalThumb = newVideoThumb, finalCover = newVideoCover;
              if (!finalThumb && newVideoFile) { try { const blob = await captureVideoFrame(newVideoFile); finalThumb = new File([blob], 'thumb.jpg', { type: 'image/jpeg' }); } catch {} }
              if (!finalCover && newVideoFile) { try { const blob = await captureVideoFrame(newVideoFile); finalCover = new File([blob], 'cover.jpg', { type: 'image/jpeg' }); } catch {} }
              setMusicVideos([...musicVideos, { id: Math.random().toString(36).substr(2, 9), ownerId: auth.currentUser?.uid || 'anonymous', title: newVideoTitle, url: newVideoUrl, file: newVideoFile, thumbnailFile: finalThumb, thumbnailUrl: finalThumb ? URL.createObjectURL(finalThumb) : undefined, coverImageFile: finalCover, coverImageUrl: finalCover ? URL.createObjectURL(finalCover) : undefined, timestamp: Date.now() }]);
              setNewVideoTitle(''); setNewVideoUrl(''); setNewVideoFile(undefined); setNewVideoThumb(undefined); setNewVideoCover(undefined);
            }} className="px-8 py-4 bg-white text-black rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all shadow-2xl active:scale-95 whitespace-nowrap">Add Video</button>
          </div>
          {musicVideos.length > 0 && (
            <div className="space-y-3 mt-2">
              {musicVideos.map((video) => (
                <div key={video.id} className="flex items-center justify-between p-4 bg-white/[0.04] border border-white/5 rounded-[2rem] group hover:bg-white/[0.06] transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-white/5 rounded-2xl overflow-hidden flex items-center justify-center ring-1 ring-white/10">
                      {video.thumbnailUrl ? <img src={video.thumbnailUrl} className="w-full h-full object-cover" alt="" /> : <VideoIcon size={20} className="text-white/20" />}
                    </div>
                    <div>
                      <p className="text-sm font-black text-white uppercase tracking-widest mb-1">{video.title}</p>
                      <p className="text-[9px] text-white/30 truncate max-w-[200px] font-bold uppercase tracking-widest">{video.file ? 'Local Upload' : (video.url || 'No source')}</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => setMusicVideos(musicVideos.filter(v => v.id !== video.id))} className="p-3 text-white/20 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-all"><Trash2 size={18} /></button>
                </div>
              ))}
            </div>
          )}
          {/* Video Playlists */}
          <div className="pt-6 border-t border-white/10 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20"><List size={16} className="text-small-orange" /></div>
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Video Playlists</span>
            </div>
            <div className="flex gap-3">
              <input type="text" value={newPlaylistTitle} onChange={(e) => setNewPlaylistTitle(e.target.value)} placeholder="Playlist Name (e.g. Live Sessions)" className="flex-1 bg-white/[0.04] border border-white/10 rounded-2xl px-6 py-4 text-white font-bold focus:outline-none focus:ring-4 focus:ring-white/5 transition-all placeholder:text-white/10" />
              <button type="button" onClick={() => { if (newPlaylistTitle) { setVideoPlaylists([...videoPlaylists, { id: Math.random().toString(36).substr(2, 9), ownerId: auth.currentUser?.uid || 'anonymous', title: newPlaylistTitle, videoIds: [], isPublic: true, timestamp: Date.now() }]); setNewPlaylistTitle(''); } }} className="px-6 py-4 bg-white/10 rounded-2xl text-white font-black text-[10px] uppercase tracking-widest hover:bg-white/20 transition-all">Create</button>
            </div>
            {videoPlaylists.map((playlist) => (
              <div key={playlist.id} className="p-6 bg-white/[0.04] border border-white/5 rounded-[2rem] space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black uppercase tracking-widest">{playlist.title}</h4>
                  <button type="button" onClick={() => setVideoPlaylists(videoPlaylists.filter(p => p.id !== playlist.id))} className="p-2 text-white/20 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-all"><Trash2 size={16} /></button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {musicVideos.map(v => (
                    <button key={v.id} type="button" onClick={() => { const isSelected = playlist.videoIds.includes(v.id); setVideoPlaylists(videoPlaylists.map(p => p.id === playlist.id ? { ...p, videoIds: isSelected ? p.videoIds.filter(id => id !== v.id) : [...p.videoIds, v.id] } : p)); }} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${playlist.videoIds.includes(v.id) ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'}`}>{v.title}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl sm:text-3xl font-display font-black tracking-tight uppercase mb-2">Connect to a World</h2>
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30">Link this project to a world or universe — all optional</p>
      </div>

      {/* World assignment */}
      <div className="grid grid-cols-1 gap-4">
        <button type="button" onClick={() => { setWorldAssignment('STANDALONE'); setWorldId(undefined); }}
          className={`flex items-start gap-6 p-8 rounded-2xl border text-left transition-all hover:scale-[1.01] active:scale-95 ${worldAssignment === 'STANDALONE' ? 'bg-white text-black border-white shadow-2xl' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
          <div className={`p-4 rounded-2xl shrink-0 ${worldAssignment === 'STANDALONE' ? 'bg-black/10' : 'bg-white/5'}`}><Globe size={26} /></div>
          <div>
            <p className="text-sm font-black uppercase tracking-widest mb-1">Standalone</p>
            <p className={`text-[10px] font-bold uppercase tracking-widest leading-relaxed ${worldAssignment === 'STANDALONE' ? 'text-black/50' : 'text-white/30'}`}>No world connection. This project stands on its own.</p>
          </div>
          {worldAssignment === 'STANDALONE' && <Check size={20} className="ml-auto shrink-0 mt-1" />}
        </button>

        <button type="button" onClick={() => setWorldAssignment('NEW')}
          className={`flex flex-col gap-4 p-5 rounded-2xl border text-left transition-all hover:scale-[1.01] active:scale-95 ${worldAssignment === 'NEW' ? 'bg-white text-black border-white shadow-2xl' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
          <div className="flex items-start gap-6 w-full">
            <div className={`p-4 rounded-2xl shrink-0 ${worldAssignment === 'NEW' ? 'bg-black/10' : 'bg-white/5'}`}><Plus size={26} /></div>
            <div className="flex-1">
              <p className="text-sm font-black uppercase tracking-widest mb-1">Create New World</p>
              <p className={`text-[10px] font-bold uppercase tracking-widest leading-relaxed ${worldAssignment === 'NEW' ? 'text-black/50' : 'text-white/30'}`}>Start a new universe for this project.</p>
            </div>
            {worldAssignment === 'NEW' && <Check size={20} className="shrink-0 mt-1" />}
          </div>
          {worldAssignment === 'NEW' && (
            <input type="text" value={newWorldName} onChange={(e) => setNewWorldName(e.target.value)}
              placeholder="World name..." onClick={(e) => e.stopPropagation()}
              className="w-full bg-black/10 border border-black/20 rounded-2xl px-6 py-4 text-black font-bold text-sm focus:outline-none placeholder:text-black/30" />
          )}
        </button>

        <button type="button" onClick={() => setWorldAssignment('EXISTING')}
          className={`flex flex-col gap-4 p-5 rounded-2xl border text-left transition-all hover:scale-[1.01] active:scale-95 ${worldAssignment === 'EXISTING' ? 'bg-white text-black border-white shadow-2xl' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
          <div className="flex items-start gap-6 w-full">
            <div className={`p-4 rounded-2xl shrink-0 ${worldAssignment === 'EXISTING' ? 'bg-black/10' : 'bg-white/5'}`}><Layers size={26} /></div>
            <div className="flex-1">
              <p className="text-sm font-black uppercase tracking-widest mb-1">Add to Existing World</p>
              <p className={`text-[10px] font-bold uppercase tracking-widest leading-relaxed ${worldAssignment === 'EXISTING' ? 'text-black/50' : 'text-white/30'}`}>Connect to one of your existing worlds.</p>
            </div>
            {worldAssignment === 'EXISTING' && <Check size={20} className="shrink-0 mt-1" />}
          </div>
          {worldAssignment === 'EXISTING' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-48 overflow-y-auto custom-scrollbar pr-1" onClick={(e) => e.stopPropagation()}>
              {availableWorlds.length === 0 && <p className="text-[10px] text-black/40 font-black uppercase tracking-widest col-span-full py-4">No worlds yet — create one first.</p>}
              {availableWorlds.map(w => (
                <button key={w.id} type="button" onClick={() => setWorldId(w.id)}
                  className={`flex items-center gap-3 p-4 rounded-2xl border transition-all text-left ${worldId === w.id ? 'bg-black text-white border-black' : 'bg-black/5 border-black/10 hover:bg-black/10 text-black'}`}>
                  <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 bg-black/10 flex items-center justify-center">
                    {w.coverImage ? <img src={w.coverImage} alt="" className="w-full h-full object-cover" /> : <Globe size={16} />}
                  </div>
                  <p className="flex-1 text-[10px] font-black uppercase tracking-widest truncate">{w.name}</p>
                  {worldId === w.id && <Check size={14} className="shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </button>
      </div>

      {/* Characters */}
      <div className="p-5 bg-white/[0.03] border border-white/10 rounded-3xl space-y-6">
        <div>
          <h3 className="text-base font-black uppercase tracking-widest">Characters</h3>
          <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest mt-1">Define characters that appear in this project — they'll be added to the world</p>
        </div>
        <div className="flex gap-3">
          <input type="text" value={newCharName} onChange={(e) => setNewCharName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newCharName.trim()) { setDraftCharacters(p => [...p, { id: Math.random().toString(36).substr(2,9), name: newCharName.trim(), role: newCharRole.trim() }]); setNewCharName(''); setNewCharRole(''); } } }}
            placeholder="Character name..." className="flex-1 bg-white/[0.04] border border-white/10 rounded-2xl px-6 py-4 text-white font-bold text-sm focus:outline-none placeholder:text-white/10" />
          <input type="text" value={newCharRole} onChange={(e) => setNewCharRole(e.target.value)}
            placeholder="Role (e.g. Protagonist)" className="flex-1 bg-white/[0.04] border border-white/10 rounded-2xl px-6 py-4 text-white font-bold text-sm focus:outline-none placeholder:text-white/10" />
          <button type="button" onClick={() => { if (!newCharName.trim()) return; setDraftCharacters(p => [...p, { id: Math.random().toString(36).substr(2,9), name: newCharName.trim(), role: newCharRole.trim() }]); setNewCharName(''); setNewCharRole(''); }}
            className="px-6 py-4 bg-white text-black rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all shrink-0">Add</button>
        </div>
        {draftCharacters.length > 0 && (
          <div className="space-y-3">
            {draftCharacters.map(char => (
              <div key={char.id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                <div>
                  <p className="text-sm font-black uppercase tracking-tight text-white">{char.name}</p>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-white/40">{char.role || 'Role not set'}</p>
                </div>
                <button type="button" onClick={() => setDraftCharacters(p => p.filter(c => c.id !== char.id))} className="text-white/20 hover:text-red-500 transition-colors p-2"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        )}
        {draftCharacters.length === 0 && (
          <p className="text-[9px] font-bold uppercase tracking-widest text-white/20 py-4 text-center border-2 border-dashed border-white/5 rounded-2xl">No characters added yet</p>
        )}
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl sm:text-3xl font-display font-black tracking-tight uppercase mb-2">Cast & Production</h2>
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30">Add actors, link them to characters, and credit production talent</p>
      </div>

      {/* Cast */}
      <div className="p-5 bg-white/[0.03] border border-white/10 rounded-3xl space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center"><User size={18} className="text-blue-400" /></div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest">Cast</h3>
            <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest">Actors and the characters they play</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input type="text" value={newCastActor} onChange={(e) => setNewCastActor(e.target.value)} placeholder="Actor name..." className="bg-white/[0.04] border border-white/10 rounded-2xl px-5 py-4 text-white font-bold text-sm focus:outline-none placeholder:text-white/10" />
          <input type="text" value={newCastChar} onChange={(e) => setNewCastChar(e.target.value)} placeholder="Character name..." className="bg-white/[0.04] border border-white/10 rounded-2xl px-5 py-4 text-white font-bold text-sm focus:outline-none placeholder:text-white/10" list="draft-char-list" />
          <datalist id="draft-char-list">{draftCharacters.map(c => <option key={c.id} value={c.name} />)}</datalist>
          <div className="flex gap-3">
            <select value={newCastRole} onChange={(e) => setNewCastRole(e.target.value)} className="flex-1 bg-white/[0.04] border border-white/10 rounded-2xl px-4 py-4 text-white font-bold text-sm focus:outline-none appearance-none">
              {['Lead','Supporting','Cameo','Voice'].map(r => <option key={r} className="bg-[#0a0a0a]">{r}</option>)}
            </select>
            <button type="button" onClick={() => {
              if (!newCastActor.trim()) return;
              const linked = draftCharacters.find(c => c.name.toLowerCase() === newCastChar.trim().toLowerCase());
              setCastMembers(p => [...p, { id: Math.random().toString(36).substr(2,9), actorName: newCastActor.trim(), characterName: newCastChar.trim() || undefined, characterId: linked?.id, role: newCastRole }]);
              setNewCastActor(''); setNewCastChar(''); setNewCastRole('Lead');
            }} className="px-6 py-4 bg-white text-black rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all shrink-0">Add</button>
          </div>
        </div>
        {castMembers.length > 0 ? (
          <div className="space-y-3">
            {castMembers.map(m => (
              <div key={m.id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center"><User size={16} className="text-blue-400" /></div>
                  <div>
                    <p className="text-sm font-black text-white">{m.actorName}</p>
                    {m.characterName && <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">as {m.characterName} · {m.role}</p>}
                  </div>
                </div>
                <button type="button" onClick={() => setCastMembers(p => p.filter(c => c.id !== m.id))} className="text-white/20 hover:text-red-500 transition-colors p-2"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[9px] font-bold uppercase tracking-widest text-white/20 py-4 text-center border-2 border-dashed border-white/5 rounded-2xl">No cast added yet</p>
        )}
      </div>

      {/* Production Credits */}
      <div className="p-5 bg-white/[0.03] border border-white/10 rounded-3xl space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center"><Settings size={18} className="text-purple-400" /></div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest">Production Talent</h3>
            <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest">Directors, producers, cinematographers &amp; more</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input type="text" value={newCredName} onChange={(e) => setNewCredName(e.target.value)} placeholder="Name..." className="bg-white/[0.04] border border-white/10 rounded-2xl px-5 py-4 text-white font-bold text-sm focus:outline-none placeholder:text-white/10" />
          <input type="text" value={newCredRole} onChange={(e) => setNewCredRole(e.target.value)} placeholder="Role (e.g. Director)" className="bg-white/[0.04] border border-white/10 rounded-2xl px-5 py-4 text-white font-bold text-sm focus:outline-none placeholder:text-white/10" />
          <div className="flex gap-3">
            <select value={newCredDept} onChange={(e) => setNewCredDept(e.target.value)} className="flex-1 bg-white/[0.04] border border-white/10 rounded-2xl px-4 py-4 text-white font-bold text-sm focus:outline-none appearance-none">
              {['Directing','Production','Writing','Camera','Sound','Editing','Visual Effects','Costume','Makeup','Production Design'].map(d => <option key={d} className="bg-[#0a0a0a]">{d}</option>)}
            </select>
            <button type="button" onClick={() => {
              if (!newCredName.trim() || !newCredRole.trim()) return;
              setProductionCredits(p => [...p, { id: Math.random().toString(36).substr(2,9), name: newCredName.trim(), role: newCredRole.trim(), department: newCredDept }]);
              setNewCredName(''); setNewCredRole('');
            }} className="px-6 py-4 bg-white text-black rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all shrink-0">Add</button>
          </div>
        </div>
        {productionCredits.length > 0 ? (
          <div className="space-y-3">
            {productionCredits.map(c => (
              <div key={c.id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                <div>
                  <p className="text-sm font-black text-white">{c.name}</p>
                  <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">{c.role} · {c.department}</p>
                </div>
                <button type="button" onClick={() => setProductionCredits(p => p.filter(x => x.id !== c.id))} className="text-white/20 hover:text-red-500 transition-colors p-2"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[9px] font-bold uppercase tracking-widest text-white/20 py-4 text-center border-2 border-dashed border-white/5 rounded-2xl">No production credits added yet</p>
        )}
      </div>
    </div>
  );

  const renderStep5 = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl sm:text-3xl font-display font-black tracking-tight uppercase mb-2">Project Details</h2>
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30">Name your project and tell your story</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.4em] text-small-orange opacity-70">
            <Pencil size={10} /> {type === 'BOOK' ? 'Book Title' : type === 'PHOTO' ? 'Collection Name' : type === 'GAME' ? 'Game Title' : 'Project Title'} <span className="text-white/25">— tap to edit</span>
          </label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Project Name" className="w-full bg-white/[0.04] border border-white/10 rounded-2xl px-6 py-3.5 text-white font-bold focus:outline-none focus:ring-4 focus:ring-white/5 transition-all placeholder:text-white/10" required />
        </div>
        <div className="space-y-3">
          <label className="block text-[10px] font-black uppercase tracking-[0.4em] text-small-orange opacity-60">
            {type === 'BOOK' ? 'Author Name' : type === 'GAME' ? 'Developer / Studio' : 'Creator Identity'}
          </label>
          <input type="text" value={artist} onChange={(e) => { setArtist(e.target.value); if (artistCharacterId) { setArtistCharacterId(undefined); setArtistWorldId(undefined); } }} placeholder="Creator Name" className="w-full bg-white/[0.04] border border-white/10 rounded-2xl px-6 py-3.5 text-white font-bold focus:outline-none focus:ring-4 focus:ring-white/5 transition-all placeholder:text-white/10" />
          {/* Persona picker — credit this release to one of your Worlds characters. The
              artist identity stays independent of your account name but attached to your IP. */}
          {personaOptions.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[9px] font-black uppercase tracking-widest text-white/30">Release as persona:</span>
              <select
                value={artistCharacterId || ''}
                onChange={(e) => applyPersona(personaOptions.find(c => c.id === e.target.value) || null)}
                className="bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2 text-white text-[11px] font-bold focus:outline-none focus:ring-2 focus:ring-white/10 transition-all appearance-none"
              >
                <option value="">Custom / none</option>
                {personaOptions.map(c => (
                  <option key={c.id} value={c.id}>{c.name}{c.role ? ` — ${c.role}` : ''}</option>
                ))}
              </select>
              {artistCharacterId && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-small-orange/15 text-small-orange text-[9px] font-black uppercase tracking-widest">
                  <User size={10} /> Persona linked
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <label className="block text-[10px] font-black uppercase tracking-[0.4em] text-small-orange opacity-60">Primary Genre</label>
          <select value={genre} onChange={(e) => setGenre(e.target.value)} className="w-full bg-white/[0.04] border border-white/10 rounded-2xl px-6 py-3.5 text-white font-bold focus:outline-none focus:ring-4 focus:ring-white/5 transition-all appearance-none">
            <option value="" className="bg-[#0a0a0a]">Select Genre</option>
            {genreOptions[type].map(g => <option key={g} value={g} className="bg-[#0a0a0a]">{g}</option>)}
            <option value="Other" className="bg-[#0a0a0a]">Other</option>
          </select>
        </div>
        <div className="space-y-3">
          <label className="block text-[10px] font-black uppercase tracking-[0.4em] text-small-orange opacity-60">Project Tags</label>
          <div className="flex gap-3">
            <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), tagInput.trim() && (setTags([...tags, tagInput.trim()]), setTagInput('')))} placeholder="Add a tag..." className="flex-1 bg-white/[0.04] border border-white/10 rounded-2xl px-6 py-4 text-white font-bold focus:outline-none focus:ring-4 focus:ring-white/5 transition-all placeholder:text-white/10" />
            <button type="button" onClick={() => { if (tagInput.trim()) { setTags([...tags, tagInput.trim()]); setTagInput(''); } }} className="px-6 py-4 bg-white/5 rounded-2xl text-white font-black text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all">Add</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {tags.map(tag => (
              <span key={tag} className="px-4 py-2 bg-white/10 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                {tag}<button type="button" onClick={() => setTags(tags.filter(t => t !== tag))} className="text-white/40 hover:text-white"><X size={10} /></button>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="block text-[10px] font-black uppercase tracking-[0.4em] text-small-orange opacity-60">
            {type === 'BOOK' ? 'About This Book' : type === 'GAME' ? 'Game Description' : 'Artist Bio / Project Description'}
          </label>
          <button type="button" onClick={handleGenerateAI} className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all text-small-orange"><Sparkles size={12} /> Generate AI Notes</button>
        </div>
        <textarea value={artistBio} onChange={(e) => setArtistBio(e.target.value)} placeholder="The story behind this project..." className="w-full bg-white/[0.04] border border-white/10 rounded-2xl px-8 py-6 text-white font-medium focus:outline-none focus:ring-4 focus:ring-white/5 transition-all h-32 resize-none placeholder:text-white/10" />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="block text-[10px] font-black uppercase tracking-[0.4em] text-small-orange opacity-60">
            {type === 'BOOK' ? 'Credits & Acknowledgements' : 'Liner Notes (Lyrics / Credits / Technical)'}
          </label>
          <button type="button" onClick={async () => { const trackNames = type === 'BOOK' ? bookChapters.map(c => c.title) : tracks.map(t => t.title); const notes = await (await import('../services/geminiService')).generateLinerNotes(title, artist, trackNames); setLinerNotes(notes); }} className="flex items-center gap-2 text-[8px] font-black uppercase tracking-widest text-small-orange hover:scale-105 transition-all"><Sparkles size={10} /> Generate AI Liner Notes</button>
        </div>
        <textarea value={linerNotes} onChange={(e) => setLinerNotes(e.target.value)} placeholder="Deep technical details, recording credits, or full project notes..." className="w-full bg-white/[0.04] border border-white/10 rounded-2xl px-8 py-6 text-white font-medium focus:outline-none focus:ring-4 focus:ring-white/5 transition-all h-32 resize-none placeholder:text-white/10" />
      </div>

      {type !== 'BOOK' && type !== 'PHOTO' && (
        <div className="space-y-3">
          <label className="block text-[10px] font-black uppercase tracking-[0.4em] text-small-orange opacity-60">
            Custom Track List Label <span className="text-white/20 normal-case font-medium tracking-normal">(optional — defaults to "Track List")</span>
          </label>
          <input
            type="text"
            value={trackListLabel}
            onChange={(e) => setTrackListLabel(e.target.value)}
            placeholder={type === 'MUSIC' ? 'e.g. Songs, Tracks, Episodes...' : 'e.g. Chapters, Scenes, Levels...'}
            className="w-full bg-white/[0.04] border border-white/10 rounded-2xl px-6 py-3.5 text-white font-bold focus:outline-none focus:ring-4 focus:ring-white/5 transition-all placeholder:text-white/10"
          />
        </div>
      )}

      <div className="space-y-3">
        <label className="block text-[10px] font-black uppercase tracking-[0.4em] text-small-orange opacity-60">Social Media Links</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Object.keys(socialLinks).map((key) => (
            <div key={key} className="relative">
              {key === 'twitter' && <Twitter className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20" size={16} />}
              {key === 'instagram' && <Instagram className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20" size={16} />}
              {key === 'youtube' && <Youtube className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20" size={16} />}
              {key === 'spotify' && <Music2 className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20" size={16} />}
              {key === 'website' && <Globe className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20" size={16} />}
              <input type="url" value={(socialLinks as any)[key]} onChange={(e) => setSocialLinks({ ...socialLinks, [key]: e.target.value })} placeholder={`${key.charAt(0).toUpperCase() + key.slice(1)} URL`} className="w-full bg-white/[0.04] border border-white/10 rounded-2xl pl-14 pr-6 py-4 text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-white/5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderStep6 = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl sm:text-3xl font-display font-black tracking-tight uppercase mb-2">Settings & Publishing</h2>
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30">Configure pricing, visibility, and distribution</p>
      </div>

      {/* ── Chora Mixes: visual show + comments ── */}
      {subType === 'MIX' && (
        <div className="p-5 bg-white/5 rounded-2xl border border-white/10 space-y-5">
          <div className="flex items-center gap-3">
            <Radio size={18} className="text-[#00DAF3] shrink-0" />
            <div>
              <h3 className="text-base font-black uppercase tracking-widest">Mix Visual</h3>
              <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">The Plajah Pixels show that plays with your mix</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button type="button" onClick={() => setMixVisualMode('AUTO')}
              className={`text-left p-5 rounded-2xl border transition-all ${mixVisualMode === 'AUTO' ? 'border-transparent shadow-2xl' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
              style={mixVisualMode === 'AUTO' ? { boxShadow: 'inset 0 0 0 2px #00DAF3', background: 'linear-gradient(180deg, rgba(0,218,243,0.08), rgba(255,255,255,0.03))' } : undefined}>
              <p className="text-sm font-black uppercase tracking-widest mb-1">Intelligent Auto-Show</p>
              <p className="text-[10px] font-bold text-white/50">Pixels listens and builds its own show — one generator at a time, advanced on the music. Zero setup.</p>
            </button>
            <button type="button" onClick={() => setMixVisualMode('AUTHORED')}
              className={`text-left p-5 rounded-2xl border transition-all ${mixVisualMode === 'AUTHORED' ? 'border-transparent shadow-2xl' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
              style={mixVisualMode === 'AUTHORED' ? { boxShadow: 'inset 0 0 0 2px #FF8C00', background: 'linear-gradient(180deg, rgba(255,140,0,0.08), rgba(255,255,255,0.03))' } : undefined}>
              <p className="text-sm font-black uppercase tracking-widest mb-1">Author's Show</p>
              <p className="text-[10px] font-bold text-white/50">Attach one of your saved Plajah Pixels projects. Plays back for listeners — reactive, but not tamperable.</p>
            </button>
          </div>
          {mixVisualMode === 'AUTHORED' && (
            <div className="pt-1">
              {mixPixelsProjects.length === 0 ? (
                <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">No saved Pixels projects found. Build and save one in Plajah Pixels, or use the Auto-Show.</p>
              ) : (
                <select value={mixPixelsProjectId} onChange={e => setMixPixelsProjectId(e.target.value)}
                  className="w-full bg-black/40 border border-white/15 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none focus:border-[#FF8C00]">
                  <option value="">Choose a Pixels project…</option>
                  {mixPixelsProjects.map(p => <option key={p.id} value={p.id}>{p.projectName}</option>)}
                </select>
              )}
            </div>
          )}
          <div className="flex items-center justify-between p-4 bg-white/[0.03] rounded-2xl border border-white/5">
            <div>
              <h4 className="text-sm font-black uppercase tracking-widest">Timestamped Comments</h4>
              <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Let listeners pin comments to moments on the wave</p>
            </div>
            <button type="button" onClick={() => setMixAllowComments(v => !v)}
              className={`px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border ${mixAllowComments ? 'bg-white text-black border-white shadow-xl' : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'}`}>
              {mixAllowComments ? 'On' : 'Off'}
            </button>
          </div>
        </div>
      )}

      {/* Rights & Identifiers — opt-in professional layer. UPC/GRid/catalogue number the
          label already holds, plus the free permanent ID and fingerprint Plajah issues. */}
      <button
        type="button"
        onClick={() => setRightsSubject({
          kind: 'ALBUM',
          id: initialAlbum?.id || projectIdRef.current,
          title: title || 'Untitled',
          creatorName: artist,
        })}
        className="w-full flex items-center gap-4 p-5 bg-white/5 rounded-2xl border border-white/10 hover:bg-white/[0.07] transition-colors text-left"
      >
        <ShieldCheck size={18} className="text-white/40 shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-black uppercase tracking-widest">Rights &amp; Identifiers</h3>
          <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">
            UPC · catalogue no. · credits &amp; splits · permanent ID
          </p>
        </div>
        <ChevronRight size={16} className="text-white/25 shrink-0" />
      </button>

      {/* Sampling & rights — let this release be sampled on the creator's terms (whole/region,
          sell/free/library/gated, splits). Sits with the professional rights layer. */}
      <button
        type="button"
        onClick={() => setSamplingSubject({
          trackId: initialAlbum?.id || projectIdRef.current,
          title: title || 'Untitled',
          ownerId: '',
          ownerName: artist,
          durationSec: undefined,
        })}
        className="w-full flex items-center gap-4 p-5 bg-white/5 rounded-2xl border border-white/10 hover:bg-white/[0.07] transition-colors text-left"
      >
        <Music2 size={18} className={samplingOn ? 'text-[#00DAF3] shrink-0' : 'text-white/40 shrink-0'} />
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-black uppercase tracking-widest">Sampling &amp; rights</h3>
          <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">
            {samplingOn ? 'sampling enabled · region · offer · splits' : 'let others sample this — region · sell/free · splits'}
          </p>
        </div>
        <ChevronRight size={16} className="text-white/25 shrink-0" />
      </button>

      {/* Project Gallery / Slideshow */}
      <div className="p-5 bg-white/5 rounded-2xl border border-white/10 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-black uppercase tracking-widest">Project Gallery</h3>
            <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Photos & slideshow assets</p>
          </div>
          <div className="relative">
            <input type="file" multiple accept="image/*" onChange={(e) => { const files = Array.from(e.target.files || []); const urls = files.map(f => URL.createObjectURL(f)); setSlideshow(prev => [...prev, ...urls]); setSlideshowFiles(prev => [...prev, ...files]); }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
            <button type="button" className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all shadow-xl"><Plus size={14} /> Add Photos</button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {slideshow.map((url, i) => (
            <div key={i} className="group relative aspect-square rounded-2xl overflow-hidden border border-white/10 bg-white/5">
              <img src={url} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" referrerPolicy="no-referrer" />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                <button type="button" onClick={() => { setSlideshow(slideshow.filter((_, idx) => idx !== i)); setSlideshowFiles(slideshowFiles.filter((_, idx) => idx !== i)); }} className="p-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all"><Trash2 size={16} /></button>
              </div>
              <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 backdrop-blur-md rounded-lg"><span className="text-[8px] font-black text-white/60 uppercase tracking-widest">#{i + 1}</span></div>
            </div>
          ))}
          {slideshow.length === 0 && <div className="col-span-full py-16 text-center border-2 border-dashed border-white/5 rounded-[2rem]"><ImageIcon size={36} className="mx-auto mb-4 text-white/5" /><p className="text-[9px] font-black uppercase tracking-[0.4em] text-white/20">No photos added</p></div>}
        </div>
        <div className="flex items-center justify-between p-6 bg-white/[0.03] rounded-[2rem] border border-white/5">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${isSlideshowEnabled ? 'bg-small-orange text-white' : 'bg-white/5 text-white/20'}`}><Sparkles size={24} /></div>
            <div>
              <h4 className="text-sm font-display font-black tracking-tight uppercase">Slideshow Experience</h4>
              <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Replace visualizer with photo gallery</p>
            </div>
          </div>
          <button type="button" onClick={() => setIsSlideshowEnabled(!isSlideshowEnabled)} className={`px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border ${isSlideshowEnabled ? 'bg-white text-black border-white shadow-xl' : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'}`}>{isSlideshowEnabled ? 'Active' : 'Enable'}</button>
        </div>
      </div>

      {/* Film/TV distribution — folded-in Distribute-New-Film options (replaces the generic
          price control for films; the deep tools live in the Film Distribution Hub). */}
      {isFilm && (
        <div className="p-5 bg-white/[0.03] border border-white/10 rounded-2xl">
          <FilmDistributionStep value={filmDist} onChange={setFilmDist} />
        </div>
      )}

      {/* Pricing (non-film) */}
      {!isFilm && (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <label className="block text-[10px] font-black uppercase tracking-[0.4em] text-small-orange opacity-60">Full Project Price ($)</label>
          <div className="flex items-center gap-3">
            <input type="number" step="0.01" value={price} onChange={(e) => setPrice(parseFloat(e.target.value))} placeholder="0.00" className="flex-1 bg-white/[0.04] border border-white/10 rounded-2xl px-6 py-3.5 text-white font-bold focus:outline-none focus:ring-4 focus:ring-white/5 transition-all placeholder:text-white/10" />
            <button type="button" onClick={() => setIsPaywalled(!isPaywalled)} className={`px-6 py-5 rounded-2xl font-black text-[10px] uppercase tracking-widest border transition-all ${isPaywalled ? 'bg-small-orange text-white border-small-orange shadow-xl' : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'}`}>{isPaywalled ? 'Paywalled' : 'Free'}</button>
          </div>
        </div>
        <div className="space-y-3">
          <label className="block text-[10px] font-black uppercase tracking-[0.4em] text-small-orange opacity-60">Gifts & Tips Goal ($)</label>
          <input type="number" value={donationGoal} onChange={(e) => setDonationGoal(parseFloat(e.target.value))} placeholder="e.g. 500.00" className="w-full bg-white/[0.04] border border-white/10 rounded-2xl px-6 py-3.5 text-white font-bold focus:outline-none focus:ring-4 focus:ring-white/5 transition-all placeholder:text-white/10" />
        </div>
      </div>
      )}

      <div className="space-y-3">
        <label className="block text-[10px] font-black uppercase tracking-[0.4em] text-small-orange opacity-60">Gallery Experience URL (Optional)</label>
        <input type="url" value={galleryUrl} onChange={(e) => setGalleryUrl(e.target.value)} placeholder="https://your-custom-gallery.com" className="w-full bg-white/[0.04] border border-white/10 rounded-2xl px-6 py-3.5 text-white font-bold focus:outline-none focus:ring-4 focus:ring-white/5 transition-all placeholder:text-white/10" />
      </div>

      <div className="space-y-3">
        <label className="block text-[10px] font-black uppercase tracking-[0.4em] text-small-orange opacity-60">Live Video Feed URL</label>
        <input type="url" value={liveFeedUrl} onChange={(e) => setLiveFeedUrl(e.target.value)} placeholder="YouTube Live / Twitch Embed URL" className="w-full bg-white/[0.04] border border-white/10 rounded-2xl px-6 py-3.5 text-white font-bold focus:outline-none focus:ring-4 focus:ring-white/5 transition-all placeholder:text-white/10" />
      </div>

      {/* Toggles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="p-6 bg-white/[0.03] border border-white/10 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20"><Globe size={18} className="text-blue-400" /></div>
              <div>
                <h4 className="text-xs font-black uppercase tracking-widest">Publish Status</h4>
                <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest">{isPrivate ? 'Private' : 'Public'}</p>
              </div>
            </div>
            <button type="button" onClick={() => setIsPrivate(!isPrivate)} className={`w-12 h-7 rounded-full transition-all relative shrink-0 ${!isPrivate ? 'bg-green-500' : 'bg-white/10'}`}>
              <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full transition-all ${!isPrivate ? 'left-5' : 'left-0.5'}`} />
            </button>
          </div>
          {/* Intimate-only — sendable only inside intimate (couples) chats */}
          <div className="flex items-center justify-between pt-4 border-t border-white/5">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/10 flex items-center justify-center border border-rose-500/20"><Heart size={18} className="text-rose-400" /></div>
              <div>
                <h4 className="text-xs font-black uppercase tracking-widest">Nibbles Only</h4>
                <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest">{isIntimateOnly ? 'Nibbles chats only' : 'Shareable anywhere'}</p>
              </div>
            </div>
            <button type="button" onClick={() => setIsIntimateOnly(!isIntimateOnly)} className={`w-12 h-7 rounded-full transition-all relative shrink-0 ${isIntimateOnly ? 'bg-rose-500' : 'bg-white/10'}`}>
              <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full transition-all ${isIntimateOnly ? 'left-5' : 'left-0.5'}`} />
            </button>
          </div>
        </div>

        {type === 'MUSIC' && (
          <div className="p-6 rounded-2xl space-y-3"
            style={{ background: publishToAudius ? 'rgba(126,34,206,0.12)' : 'rgba(255,255,255,0.03)', border: publishToAudius ? '1px solid rgba(168,85,247,0.4)' : '1px solid rgba(255,255,255,0.1)' }}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center border shrink-0"
                  style={{ background: 'rgba(126,34,206,0.15)', borderColor: 'rgba(168,85,247,0.3)' }}>
                  <Music2 size={18} style={{ color: '#a855f7' }} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-xs font-black uppercase tracking-widest">Also share to Audius</h4>
                    <span className="text-[7px] font-black uppercase tracking-[0.2em] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.12)' }}>Optional</span>
                    <span className="text-[7px] font-black uppercase tracking-[0.2em] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(168,85,247,0.12)', color: 'rgba(168,85,247,0.8)', border: '1px solid rgba(168,85,247,0.25)' }}>Third-party</span>
                  </div>
                  <p className="text-[9px] font-bold uppercase tracking-widest mt-1" style={{ color: 'rgba(168,85,247,0.75)' }}>Reach a whole new audience — keeps your Plajah release exactly as-is</p>
                </div>
              </div>
              <button type="button" onClick={() => setPublishToAudius(!publishToAudius)}
                className="w-12 h-7 rounded-full transition-all relative shrink-0"
                style={{ background: publishToAudius ? '#7e22ce' : 'rgba(255,255,255,0.1)' }}>
                <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full transition-all ${publishToAudius ? 'left-5' : 'left-0.5'}`} />
              </button>
            </div>
            {/* Always-visible "what is this" — encourages learning, off by default */}
            <div className="flex items-start gap-2.5 px-1 pt-1">
              <Info size={12} className="shrink-0 mt-0.5" style={{ color: 'rgba(168,85,247,0.7)' }} />
              <p className="text-[9px] leading-relaxed flex-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Audius is a separate, independent music streaming network — not part of Plajah. Flipping this on
                <span className="font-black text-white/70"> additionally </span>
                pushes this release there for extra discovery and pays artists in $AUDIO tokens; your music stays
                published on Plajah either way. It's entirely your call.
                {' '}
                <button type="button" onClick={() => window.open('https://audius.co/about', '_blank')}
                  className="inline-flex items-center gap-1 font-black underline whitespace-nowrap" style={{ color: '#a855f7' }}>
                  Learn about Audius <ExternalLink size={9} />
                </button>
              </p>
            </div>
            {publishToAudius && (
              <div className="space-y-3 pt-2 border-t border-purple-900/30">
                <div className="flex items-start gap-3 px-1">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: '#a855f7' }} />
                  <p className="text-[9px] leading-relaxed" style={{ color: 'rgba(168,85,247,0.8)' }}>
                    Your album will be queued for publishing to the Audius decentralized network after saving.
                    Connect your Audius account in <span className="font-black">Profile → Settings → Audius</span> to enable direct publishing.
                    Audius pays artists in $AUDIO tokens on every stream — no middlemen.
                  </p>
                </div>
                {/* Legal disclaimer */}
                <div className="px-3 py-3 rounded-xl" style={{ background: 'rgba(126,34,206,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}>
                  <p className="text-[8px] font-black uppercase tracking-widest mb-1.5" style={{ color: 'rgba(168,85,247,0.7)' }}>⚖ Legal Notice — Required Before Publishing</p>
                  <p className="text-[8px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    By enabling this toggle you confirm: (1) You are the original creator and sole rights holder of all tracks in this album, or you have secured all necessary licenses from rights holders;
                    (2) Publishing to Audius constitutes making your content available on a public, decentralized, immutable network — removal may not be technically guaranteed;
                    (3) Plajah acts only as a technical bridge and bears no liability for rights disputes, royalty claims, or third-party takedown requests arising from content you upload to Audius;
                    (4) You agree to Audius's <span className="font-black underline cursor-pointer" onClick={() => window.open('https://audius.co/legal/terms-of-use','_blank')}>Terms of Use</span> and accept that $AUDIO token earnings are subject to Audius's creator reward programme rules.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {(type === 'VIDEO' || (type === 'MUSIC' && musicVideos.length > 0)) && (
          <div className="p-6 bg-white/[0.03] border border-white/10 rounded-2xl">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20 shrink-0"><VideoIcon size={18} className="text-small-orange" /></div>
                <div className="min-w-0">
                  <h4 className="text-xs font-black uppercase tracking-widest">Also send to Reello</h4>
                  <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest">
                    {type === 'MUSIC'
                      ? `Your ${musicVideos.length} music video${musicVideos.length > 1 ? 's' : ''} also go to the Reello video feed for more reach`
                      : 'Also surface this in the Reello video feed — it stays in Taleo either way'}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setPublishVideosToGallery(!publishVideosToGallery)} className={`w-12 h-7 rounded-full transition-all relative shrink-0 ${publishVideosToGallery ? 'bg-small-orange' : 'bg-white/10'}`}>
                <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full transition-all ${publishVideosToGallery ? 'left-5' : 'left-0.5'}`} />
              </button>
            </div>
            {type === 'MUSIC' && publishVideosToGallery && (
              <div className="flex items-start gap-2.5 px-1 pt-3 mt-3 border-t border-white/5">
                <Info size={12} className="shrink-0 mt-0.5 text-small-orange/70" />
                <p className="text-[9px] leading-relaxed text-white/45">
                  Music videos attached to this album will be posted to Reello (the platform's video feed) so fans
                  who browse video discover them too — your album stays exactly as-is on Chora. Turn off to keep them album-only.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Content licensing — optional, background; gated behind CONTENT_LICENSING */}
        {licensingEnabled && (
          <LicensePicker
            value={license}
            onChange={(id: ContentLicenseId) => setLicense(id)}
            context={{ isPaywalled: isPaywalled || price > 0 || tracks.some(t => t.isPaywalled) }}
          />
        )}

        <div className="p-6 bg-white/[0.03] border border-white/10 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20"><Settings size={18} className="text-purple-400" /></div>
              <div>
                <h4 className="text-xs font-black uppercase tracking-widest">Schedule Release</h4>
                <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest">Set a future release date</p>
              </div>
            </div>
            <button type="button" onClick={() => setIsScheduled(!isScheduled)} className={`w-12 h-7 rounded-full transition-all relative ${isScheduled ? 'bg-small-orange' : 'bg-white/10'}`}>
              <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full transition-all ${isScheduled ? 'left-5' : 'left-0.5'}`} />
            </button>
          </div>
          {isScheduled && (
            <div className="space-y-2">
              <label className="block text-[9px] font-black uppercase tracking-widest text-white/20">Release Date & Time</label>
              <input type="datetime-local" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} className="w-full bg-white/[0.04] border border-white/10 rounded-2xl px-6 py-4 text-white text-xs font-bold focus:outline-none focus:ring-4 focus:ring-white/5 transition-all" />
            </div>
          )}
        </div>
      </div>

      {/* Early Access & Review Codes */}
      <div className="p-5 bg-white/[0.03] border border-white/10 rounded-3xl space-y-4">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
            <Lock size={18} className="text-amber-400" />
          </div>
          <div>
            <h4 className="text-xs font-black uppercase tracking-widest">Early Access &amp; Review Codes</h4>
            <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest">
              Invite press, curators &amp; fans to hear your music before release
            </p>
          </div>
        </div>
        {/* Only meaningful when we have an album ID (editing existing) */}
        {initialAlbum?.id ? (
          <EarlyAccessManager
            album={{ ...initialAlbum, isScheduled, releaseDate: releaseDate ? new Date(releaseDate).getTime() : undefined } as Album}
            onAlbumUpdate={(partial) => {
              // Merge updates back into local form state
              if (partial.earlyAccessEnabled !== undefined) {/* handled inside manager */}
            }}
          />
        ) : (
          <div className="p-4 rounded-2xl text-center" style={{ border: '1px dashed rgba(255,255,255,0.1)' }}>
            <p className="text-[9px] text-white/30 uppercase tracking-widest">
              Save &amp; publish the album first, then configure Early Access from the album settings.
            </p>
          </div>
        )}
      </div>

      {/* Related Projects */}
      <div className="p-5 bg-white/[0.03] border border-white/10 rounded-3xl space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20"><Layers size={18} className="text-blue-400" /></div>
          <div>
            <h4 className="text-xs font-black uppercase tracking-widest">Related Projects (IP Ecosystem)</h4>
            <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest">Connect to other projects in the same universe</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
          {availableAlbums.map(a => (
            <button key={a.id} type="button" onClick={() => setRelatedProjectIds(prev => prev.includes(a.id) ? prev.filter(id => id !== a.id) : [...prev, a.id])} className={`flex items-center gap-4 p-4 rounded-2xl border transition-all text-left ${relatedProjectIds.includes(a.id) ? 'bg-blue-500/10 border-blue-500/50 ring-1 ring-blue-500/50' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
              <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0">{a.coverImage && <img src={a.coverImage} alt="" className="w-full h-full object-cover" />}</div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase tracking-tight text-white truncate">{a.title}</p>
                <p className="text-[8px] font-bold uppercase tracking-widest text-white/40">{a.type}</p>
              </div>
              {relatedProjectIds.includes(a.id) && <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center"><Check size={12} className="text-white" /></div>}
            </button>
          ))}
          {availableAlbums.length === 0 && <div className="col-span-full py-10 text-center opacity-20 border-2 border-dashed border-white/5 rounded-2xl"><p className="text-[9px] font-black uppercase tracking-widest">No other projects to link</p></div>}
        </div>
      </div>
    </div>
  );

  const handleCreatorHnsSlotUpload = async (track: Track, slot: 1 | 2, file: File) => {
    const key = `${track.id}_slot${slot}`;
    setHnsSlotUploading(key);
    setHnsSlotProgress(prev => ({ ...prev, [key]: 0 }));
    try {
      const albumId = initialAlbum?.id || 'draft';
      const url = await storageUpload(
        `albums/${albumId}/hns/${track.id}_slot${slot}_${Date.now()}`,
        file,
        (p) => setHnsSlotProgress(prev => ({ ...prev, [key]: p }))
      );
      const updatedTrack: Track = {
        ...track,
        [`hnsSlot${slot}`]: { url, title: file.name.replace(/\.[^/.]+$/, ''), uploadedAt: Date.now() },
      };
      setTracks(tracks.map(t => t.id === track.id ? updatedTrack : t));
      setHnsSlotSaved(key);
      setTimeout(() => setHnsSlotSaved(null), 2500);
    } catch (e) { console.error('HnS slot upload failed', e); }
    finally {
      setHnsSlotUploading(null);
      setHnsSlotProgress(prev => { const n = { ...prev }; delete n[key]; return n; });
    }
  };

  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const renderStep7 = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl sm:text-3xl font-display font-black tracking-tight uppercase mb-2">Track Management</h2>
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30">Arrange, rename, and configure Hide &amp; Seek for each track</p>
      </div>

      {/* HnS Master Controls */}
      <div className="p-5 bg-white/[0.03] border border-white/10 rounded-2xl space-y-6">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all ${hnsEnabled ? 'bg-small-orange/20 border-small-orange/40' : 'bg-white/5 border-white/10'}`}>
            <Eye size={22} className={hnsEnabled ? 'text-small-orange' : 'text-white/20'} />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-black uppercase tracking-widest">Hide &amp; Seek Feature</h3>
            <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest mt-0.5">Swap alternate tracks at scheduled times</p>
          </div>
          <button
            type="button"
            onClick={() => setHnsEnabled(!hnsEnabled)}
            className={`w-14 h-8 rounded-full transition-all relative shrink-0 ${hnsEnabled ? 'bg-small-orange' : 'bg-white/10'}`}
          >
            <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all shadow ${hnsEnabled ? 'left-7' : 'left-1'}`} />
          </button>
        </div>

        {hnsEnabled && (
          <>
            <div className="flex items-center justify-between p-5 bg-white/[0.03] rounded-2xl border border-white/5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest">Global Mode</p>
                <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest mt-0.5">Apply one schedule to all tracks</p>
              </div>
              <button
                type="button"
                onClick={() => setHnsGlobalMode(!hnsGlobalMode)}
                className={`w-12 h-7 rounded-full transition-all relative shrink-0 ${hnsGlobalMode ? 'bg-small-orange' : 'bg-white/10'}`}
              >
                <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full transition-all shadow ${hnsGlobalMode ? 'left-5' : 'left-0.5'}`} />
              </button>
            </div>

            {/* Schedule Windows */}
            <div className="space-y-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Schedule Windows</p>
              {hnsWindows.map((win: any, i: number) => (
                <div key={i} className="flex items-center gap-3 p-4 bg-small-orange/5 border border-small-orange/20 rounded-2xl">
                  <div className="flex-1 flex flex-wrap gap-1.5">
                    {(win.daysOfWeek || []).map((d: number) => (
                      <span key={d} className="px-2 py-0.5 bg-small-orange/20 text-small-orange text-[8px] font-black uppercase rounded-lg">{DAY_LABELS[d]}</span>
                    ))}
                    <span className="px-2 py-0.5 bg-white/10 text-white/60 text-[8px] font-black uppercase rounded-lg">{win.startTime} (3 hrs)</span>
                  </div>
                  <button type="button" onClick={() => setHnsWindows(hnsWindows.filter((_: any, idx: number) => idx !== i))} className="p-2 text-white/20 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"><X size={14} /></button>
                </div>
              ))}

              {/* Add window form */}
              <div className="p-5 bg-white/[0.03] border border-white/10 rounded-2xl space-y-4">
                <p className="text-[8px] font-black uppercase tracking-widest text-white/20">Add Window</p>
                <div className="flex flex-wrap gap-2">
                  {DAY_LABELS.map((d, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setHnsNewDays(hnsNewDays.includes(i) ? hnsNewDays.filter((x: number) => x !== i) : [...hnsNewDays, i])}
                      className={`px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest border transition-all ${hnsNewDays.includes(i) ? 'bg-small-orange text-white border-small-orange' : 'bg-white/5 border-white/10 text-white/30'}`}
                    >{d}</button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 space-y-1">
                    <label className="text-[8px] font-black uppercase tracking-widest text-white/20">Start time (3 hr window)</label>
                    <input type="time" value={hnsNewTime} onChange={(e) => setHnsNewTime(e.target.value)} className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-bold focus:outline-none" />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (hnsNewDays.length === 0) return;
                      setHnsWindows([...hnsWindows, { id: Math.random().toString(36).substr(2, 9), daysOfWeek: hnsNewDays, startTime: hnsNewTime }]);
                    }}
                    className="mt-5 px-5 py-3 bg-small-orange text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:scale-105 transition-all"
                  >Add</button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* HnS Save + Schedule (appears when slots are assigned) */}
      {hnsEnabled && hnsSlotsDirty && !hnsScheduleSaved && (
        <div className="flex items-center justify-between gap-4 p-4 rounded-2xl animate-in fade-in duration-300"
          style={{ background: 'rgba(255,140,0,0.08)', border: '1px solid rgba(255,140,0,0.3)' }}>
          <div className="flex items-center gap-3">
            <Eye size={16} className="text-small-orange shrink-0" />
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-small-orange">Slot assignments ready</p>
              <p className="text-[8px] text-white/40 mt-0.5">Save to lock in your Hide &amp; Seek schedule</p>
            </div>
          </div>
          <button type="button"
            onClick={() => setHnsScheduleSaved(true)}
            className="shrink-0 px-5 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all hover:scale-105"
            style={{ background: '#ff8c00', color: '#000' }}>
            Save & Get Schedule
          </button>
        </div>
      )}

      {/* Schedule Summary — shown after save */}
      {hnsEnabled && hnsScheduleSaved && hnsWindows.length > 0 && (
        <div className="p-5 rounded-2xl space-y-3 animate-in fade-in duration-300"
          style={{ background: 'rgba(255,140,0,0.06)', border: '1px solid rgba(255,140,0,0.25)' }}>
          <div className="flex items-center gap-2">
            <Eye size={14} className="text-small-orange" />
            <p className="text-[9px] font-black uppercase tracking-widest text-small-orange">Your Hide &amp; Seek Schedule</p>
          </div>
          {hnsWindows.map((win: any, i: number) => {
            const [hh, mm] = (win.startTime as string).split(':').map(Number);
            const endH = ((hh + 3) % 24).toString().padStart(2, '0');
            const days = (win.daysOfWeek as number[]).map((d: number) => DAY_LABELS[d]).join(', ');
            const ampm = (h: number) => h >= 12 ? `${h === 12 ? 12 : h - 12}:${mm.toString().padStart(2,'0')} PM` : `${h || 12}:${mm.toString().padStart(2,'0')} AM`;
            return (
              <div key={i} className="flex items-center gap-3 text-[9px]">
                <div className="w-1.5 h-1.5 rounded-full bg-small-orange shrink-0" />
                <span className="font-black text-white/70">{days}</span>
                <span className="text-white/40">{ampm(hh)} – {ampm(hh + 3)} (3 hrs)</span>
              </div>
            );
          })}
          <p className="text-[8px] text-white/30 mt-1">
            Listeners who play this album during these windows will hear your hidden alternate tracks. Each 3-hour window is a fresh discovery session — fans get points for finding them first.
          </p>
        </div>
      )}

      {/* Track List — rename, reorder, HnS slots */}
      {tracks.length === 0 ? (
        <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-2xl opacity-30">
          <p className="text-[10px] font-black uppercase tracking-[0.3em]">No tracks yet — add them in the Content step</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tracks.map((track, i) => (
            <div
              key={track.id}
              draggable
              onDragStart={() => { dragIndexRef.current = i; }}
              onDragOver={(e) => { e.preventDefault(); setDragOverIndex(i); }}
              onDragLeave={() => setDragOverIndex(null)}
              onDrop={(e) => {
                e.preventDefault();
                const from = dragIndexRef.current;
                setDragOverIndex(null);
                if (from === null || from === i) return;
                const reordered = [...tracks];
                const [moved] = reordered.splice(from, 1);
                reordered.splice(i, 0, moved);
                setTracks(reordered);
                dragIndexRef.current = null;
              }}
              onDragEnd={() => { dragIndexRef.current = null; setDragOverIndex(null); }}
              className={`rounded-[2rem] border transition-all ${dragOverIndex === i ? 'border-small-orange/50 scale-[1.01]' : 'border-white/5'}`}
            >
              {/* Track header row */}
              <div className={`flex items-center gap-3 p-5 rounded-[2rem] ${dragOverIndex === i ? 'bg-small-orange/10' : 'bg-white/[0.04] hover:bg-white/[0.06]'} cursor-grab active:cursor-grabbing`}>
                <GripVertical size={16} className="text-white/20 shrink-0" />
                <span className="w-7 text-center text-[10px] font-black text-small-orange shrink-0">{i + 1}</span>
                <input
                  type="text"
                  value={track.title}
                  onChange={(e) => updateTrack(track.id, { title: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 bg-transparent border-b border-white/10 focus:border-small-orange/60 outline-none text-sm font-black uppercase tracking-wide text-white placeholder:text-white/20 pb-0.5 transition-colors"
                  placeholder="Track title…"
                />
                {/* Per-recording identifiers: ISRC lives on the track, never the release. */}
                <button
                  type="button"
                  title="ISRC, composition & splits for this recording"
                  onClick={(e) => { e.stopPropagation(); setRightsSubject({ kind: 'TRACK', id: track.id, title: track.title, creatorName: artist }); }}
                  className="p-1.5 shrink-0 text-white/20 hover:text-white transition-colors rounded"
                >
                  <ShieldCheck size={13} />
                </button>
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button type="button" disabled={i === 0} onClick={() => { const r = [...tracks]; [r[i-1], r[i]] = [r[i], r[i-1]]; setTracks(r); }} className="p-1 text-white/20 hover:text-white disabled:opacity-10 transition-colors rounded"><ChevronUp size={12} /></button>
                  <button type="button" disabled={i === tracks.length - 1} onClick={() => { const r = [...tracks]; [r[i+1], r[i]] = [r[i], r[i+1]]; setTracks(r); }} className="p-1 text-white/20 hover:text-white disabled:opacity-10 transition-colors rounded"><ChevronDown size={12} /></button>
                </div>
              </div>

              {/* HnS Slot uploads */}
              {hnsEnabled && (
                <div className="px-5 pb-5 pt-2 space-y-2 border-t border-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[8px] font-black uppercase tracking-widest text-white/20">Alternate Slots</p>
                    {i === 0 && <span className="text-[7px] px-2 py-0.5 rounded-full bg-white/5 text-white/30 font-black uppercase">Can receive slots · cannot be a slot source</span>}
                  </div>
                  {([1, 2] as const).map(slot => {
                    const slotKey = `hnsSlot${slot}` as 'hnsSlot1' | 'hnsSlot2';
                    const existing = (track as any)[slotKey];
                    const key = `${track.id}_slot${slot}`;
                    const uploading = hnsSlotUploading === key;
                    const progress = hnsSlotProgress[key] ?? 0;
                    const saved = hnsSlotSaved === key;
                    return (
                      <div key={slot} className={`flex items-center gap-2 p-3 rounded-xl border transition-all ${existing ? 'border-small-orange/30 bg-small-orange/5' : 'border-white/10 bg-white/5'}`}>
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[9px] font-black ${existing ? 'bg-small-orange/20 text-small-orange' : 'bg-white/5 text-white/30'}`}>
                          {uploading ? <Loader2 size={11} className="animate-spin" /> : saved ? <Check size={11} className="text-green-400" /> : `S${slot}`}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Slot {slot}</p>
                          <p className="text-[10px] font-bold truncate">{saved ? 'Saved!' : existing ? existing.title : 'No track assigned'}</p>
                        </div>
                        {/* Pick from album tracks */}
                        <button type="button"
                          onClick={() => setHnsTrackPicker({ trackId: track.id, slot })}
                          className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all"
                          style={{ background: 'rgba(255,140,0,0.12)', color: 'rgba(255,140,0,0.8)', border: '1px solid rgba(255,140,0,0.25)' }}>
                          <Music2 size={9} /> Pick
                        </button>
                        {/* Upload new file */}
                        <label className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest cursor-pointer transition-all hover:bg-white/10"
                          style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.1)' }}>
                          <Upload size={9} /> File
                          <input type="file" accept={AUDIO_ACCEPT + ',' + VIDEO_ACCEPT} className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCreatorHnsSlotUpload(track, slot, f); }} />
                        </label>
                        {existing && (
                          <button type="button"
                            onClick={() => setTracks(tracks.map(t => t.id === track.id ? { ...t, [`hnsSlot${slot}`]: undefined } : t))}
                            className="shrink-0 p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all">
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {hnsSlotUploading?.startsWith(track.id) && (
                    <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-small-orange rounded-full transition-all duration-200" style={{ width: `${hnsSlotProgress[hnsSlotUploading || ''] ?? 0}%` }} />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Handle track-as-slot assignment from picker
  const handlePickTrackForSlot = (sourceTrack: Track) => {
    if (!hnsTrackPicker) return;
    const { trackId, slot } = hnsTrackPicker;
    setTracks(tracks.map(t => t.id === trackId
      ? { ...t, [`hnsSlot${slot}`]: { url: sourceTrack.url, title: sourceTrack.title, uploadedAt: Date.now() } }
      : t
    ));
    setHnsSlotsDirty(true);
    setHnsScheduleSaved(false);
    setHnsTrackPicker(null);
  };

  const stepContent = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4, renderStep5, renderStep6, renderStep7];

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[200] p-4 md:p-8" style={{ background: 'rgba(4,3,10,0.60)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>

      {/* Rights & Identifiers — opened from the release settings or from a track row.
          Mounted here so it survives step changes. */}
      {rightsSubject && (
        <Suspense fallback={null}>
          <RightsIdentifiersPanel subject={rightsSubject} onClose={() => setRightsSubject(null)} />
        </Suspense>
      )}

      {/* Sampling & rights — persists the owner's terms so the listener "Sample this" flow can
          resolve them. Mounted here so it survives step changes. */}
      {samplingSubject && (
        <Suspense fallback={null}>
          <SamplingRightsPanel
            subject={samplingSubject}
            onSave={(c) => {
              setSamplingOn(!!c);
              if (c) void import('../services/melos/sampling/clearanceStore').then((m) => m.saveClearance(c));
            }}
            onClose={() => setSamplingSubject(null)}
          />
        </Suspense>
      )}

      {/* Project Promo — the promo-kit folder, layered over the wizard like the HNS picker. */}
      {promoMode && (
        <div className="absolute inset-0 z-[350] flex items-center justify-center p-4 md:p-8" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
          <div
            className="max-w-3xl w-full h-full lg:h-[88vh] max-h-[900px] rounded-3xl border border-white/10 overflow-hidden flex flex-col animate-in zoom-in-95 duration-300"
            style={{ background: 'radial-gradient(ellipse 80% 55% at 8% -8%, rgba(107,0,153,0.30) 0%, transparent 56%), radial-gradient(ellipse 62% 50% at 94% 108%, rgba(212,0,85,0.22) 0%, transparent 55%), #0b0714' }}
          >
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 sm:p-8">
              <Suspense fallback={<div className="py-20 flex justify-center"><Loader2 className="animate-spin text-white/30" size={28} /></div>}>
                <ProjectPromoManager onBack={() => setPromoMode(false)} preselectedAlbum={initialAlbum} />
              </Suspense>
            </div>
          </div>
        </div>
      )}

      {/* HNS Track Picker Modal */}
      {hnsTrackPicker && (
        <div className="absolute inset-0 z-[400] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}>
          <div className="w-96 rounded-3xl p-6 space-y-4" style={{ background: '#0d0d14', border: '1px solid rgba(255,140,0,0.3)' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-widest">Pick a Track for Slot {hnsTrackPicker.slot}</p>
                <p className="text-[9px] text-white/30 mt-0.5 uppercase tracking-widest">Select which album track to hide in this slot</p>
              </div>
              <button type="button" onClick={() => setHnsTrackPicker(null)} className="text-white/30 hover:text-white"><X size={16} /></button>
            </div>
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {tracks.map((t, idx) => {
                const isParent = t.id === hnsTrackPicker.trackId;
                const isFirst = idx === 0;
                const disabled = isParent || isFirst;
                const usedCount = tracks.reduce((acc, tr) => {
                  return acc + ((tr as any).hnsSlot1?.url === t.url ? 1 : 0) + ((tr as any).hnsSlot2?.url === t.url ? 1 : 0);
                }, 0);
                const atLimit = !disabled && usedCount >= 2;
                return (
                  <button key={t.id} type="button"
                    disabled={disabled || atLimit}
                    onClick={() => handlePickTrackForSlot(t)}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-all hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                    <span className="w-5 text-center text-[9px] font-black shrink-0" style={{ color: idx === 0 ? 'rgba(255,255,255,0.2)' : '#ff8c00' }}>{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest truncate">{t.title}</p>
                      <p className="text-[8px] text-white/30 uppercase tracking-widest">
                        {isFirst ? 'Track #1 — cannot be a slot source' : isParent ? 'Current track' : atLimit ? 'Already used in 2 slots' : `${2 - usedCount} slot${2 - usedCount !== 1 ? 's' : ''} remaining`}
                      </p>
                    </div>
                    {!disabled && !atLimit && <ChevronRight size={12} className="text-white/30 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div
        className="max-w-7xl w-full border border-white/10 rounded-3xl sm:rounded-[2rem] overflow-hidden flex flex-col lg:flex-row shadow-3xl h-full lg:h-[88vh] max-h-[1000px] animate-in zoom-in-95 duration-300"
        style={{ background: 'radial-gradient(ellipse 80% 55% at 8% -8%, rgba(107,0,153,0.30) 0%, transparent 56%), radial-gradient(ellipse 62% 50% at 94% 108%, rgba(212,0,85,0.22) 0%, transparent 55%), radial-gradient(ellipse 55% 42% at 62% 45%, rgba(255,140,0,0.12) 0%, transparent 62%), rgba(6,6,12,0.72)', backdropFilter: 'blur(40px) saturate(1.6)', WebkitBackdropFilter: 'blur(40px) saturate(1.6)' }}
      >

        {/* Deploy Overlay */}
        {isDeploying && (
          <div className="absolute inset-0 z-[300] bg-black/90 backdrop-blur-2xl flex flex-col items-center justify-center p-8 sm:p-16 text-center animate-in fade-in duration-500 overflow-y-auto custom-scrollbar">
            <div className="w-28 h-28 sm:w-40 sm:h-40 relative mb-10 sm:mb-16 shrink-0">
              <div className="absolute inset-0 border-8 border-white/5 rounded-full" />
              <div className="absolute inset-0 border-8 border-white rounded-full border-t-transparent animate-spin" style={{ animationDuration: '2s' }} />
              <Sparkles className="absolute inset-0 m-auto text-white" size={48} />
            </div>
            <h2 className="text-4xl lg:text-5xl font-display font-black tracking-tighter mb-6 uppercase">{status.text}</h2>
            <div className="w-full max-w-lg h-2 bg-white/10 rounded-full overflow-hidden mb-6 shadow-inner">
              <div className="h-full bg-green-500 transition-all duration-700 shadow-[0_0_30px_rgba(34,197,94,0.8)]" style={{ width: `${status.percent}%` }} />
            </div>
            <p className="text-xs font-black uppercase tracking-[0.5em] text-white/40">{status.percent}% SYNCHRONIZED WITH GLOBAL CLOUD</p>

            {recentAdditions.length > 0 && (
              <div className="mt-14 w-full max-w-2xl">
                <p className="text-[9px] font-black uppercase tracking-[0.4em] text-white/30 mb-4">While you wait — fresh on Plajah</p>
                <div className="flex gap-3 overflow-x-auto custom-scrollbar pb-2 -mx-2 px-2">
                  {recentAdditions.map(a => (
                    <div key={a.id} className="shrink-0 w-28 text-left">
                      <div className="w-28 h-28 rounded-2xl overflow-hidden border border-white/10 bg-white/5">
                        {a.coverImage && <img src={a.coverImage} alt="" className="w-full h-full object-cover" loading="lazy" />}
                      </div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/60 truncate mt-2">{a.title}</p>
                      <p className="text-[8px] font-bold uppercase tracking-widest text-white/25 truncate">{a.artist}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Mobile: compact header (each step is its own paged screen below) ── */}
        {isMobile && (
          <div className="shrink-0 px-4 pt-4 pb-3 bg-white/[0.05] backdrop-blur-2xl border-b border-white/10 space-y-3">
            <div className="flex items-center gap-3">
              <button type="button" onClick={requestClose} className="p-2.5 bg-white/5 rounded-xl text-white/50 active:scale-90 shrink-0"><X size={18} /></button>
              <label className="relative w-10 h-10 rounded-xl overflow-hidden border border-white/15 shrink-0 cursor-pointer">
                <img src={coverImage || undefined} alt="Cover" className="w-full h-full object-cover" />
                <input type="file" className="hidden" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setCoverImage(URL.createObjectURL(f)); setCoverFile(f); } }} />
              </label>
              <div className="relative flex-1 min-w-0">
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Untitled Project" aria-label="Project title"
                  className="w-full min-w-0 text-sm font-display font-black uppercase tracking-tight bg-transparent text-white placeholder:text-white/25 rounded-lg pr-6 py-1 border-b border-dashed border-white/20 focus:border-small-orange outline-none" />
                <Pencil size={11} className="absolute right-1 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
              </div>
              {onMinimize && <button type="button" onClick={onMinimize} className="p-2.5 bg-white/5 rounded-xl text-white/50 active:scale-90 shrink-0"><Minimize2 size={18} /></button>}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-[0.25em] text-white/40">
                <span>Step {displayStep + 1} of {totalDisplaySteps}</span>
                <span className="text-small-orange/80 truncate ml-2">{labels[displayStep]}</span>
              </div>
              <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${(displayStep / Math.max(1, totalDisplaySteps - 1)) * 100}%` }} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 rounded-full cursor-pointer border border-white/8 text-[8px] font-black uppercase tracking-widest text-small-orange active:scale-95">
                <ImageIcon size={10} /> Slideshow ({slideshow.length})
                <input type="file" multiple className="hidden" accept="image/*" onChange={(e) => { const files = Array.from(e.target.files || []) as File[]; setSlideshowFiles(files); setSlideshow(files.map(f => URL.createObjectURL(f))); }} />
              </label>
              <button
                type="button"
                onClick={() => { setPageDir(step < 2 ? 1 : -1); setStep(2); setContentTab('videos'); }}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 rounded-full border border-white/8 text-[8px] font-black uppercase tracking-widest text-small-orange active:scale-95"
              >
                <VideoIcon size={10} /> Videos & BTS
              </button>
              <label className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 rounded-full cursor-pointer border border-white/8 text-[8px] font-black uppercase tracking-widest text-small-orange active:scale-95">
                <User size={10} /> Profile Pix
                <input type="file" className="hidden" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setArtistImage(URL.createObjectURL(f)); setArtistFile(f); } }} />
              </label>
            </div>
          </div>
        )}

        {/* Left Panel — Cover Art (desktop only) */}
        {!isMobile && (
        <div className="lg:w-[32%] p-5 sm:p-7 lg:p-5 bg-white/[0.04] backdrop-blur-2xl flex flex-col items-center justify-center text-center border-b lg:border-b-0 lg:border-r border-white/10 relative shrink-0">
          <div className="absolute top-8 left-8 flex items-center gap-2">
            <button type="button" onClick={requestClose} className="p-4 bg-white/5 rounded-2xl text-white/40 hover:text-white hover:bg-white/10 transition-all active:scale-90"><X size={24} /></button>
            {onMinimize && <button type="button" onClick={onMinimize} className="p-4 bg-white/5 rounded-2xl text-white/40 hover:text-white hover:bg-white/10 transition-all active:scale-90"><Minimize2 size={24} /></button>}
          </div>

          <div className="relative group mb-8">
            <div className="w-36 h-36 sm:w-44 sm:h-44 lg:w-56 lg:h-56 rounded-3xl overflow-hidden shadow-3xl ring-2 ring-white/10 transition-transform group-hover:scale-105 duration-500">
              <img src={coverImage || undefined} alt="Cover" className="w-full h-full object-cover" />
            </div>
            <label className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-all cursor-pointer rounded-3xl backdrop-blur-md">
              <div className="flex flex-col items-center gap-3">
                <div className="p-4 bg-white text-black rounded-2xl shadow-2xl"><ImageIcon size={32} /></div>
                <span className="text-[10px] font-black uppercase tracking-widest">Update Artwork</span>
              </div>
              <input type="file" className="hidden" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setCoverImage(URL.createObjectURL(f)); setCoverFile(f); } }} />
            </label>
            {/* Share icon on thumbnail — always clickable, sits above the artwork hover */}
            <button
              type="button"
              onClick={async (e) => {
                e.stopPropagation();
                const shareLink = initialAlbum?.id ? buildShareUrl('album', initialAlbum.id) : window.location.origin;
                const shareData = { title: title || 'Check out this album on Plajah', text: shareText(title, artist), url: shareLink };
                if (navigator.share) { try { await navigator.share(shareData); } catch {} }
                else { await navigator.clipboard.writeText(shareLink); }
              }}
              className="absolute top-2.5 right-2.5 z-10 w-9 h-9 rounded-xl bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white/60 hover:text-white hover:bg-black/80 hover:border-white/40 transition-all opacity-0 group-hover:opacity-100"
            >
              <Share2 size={14} />
            </button>
          </div>

          {/* Directly-editable project title — obvious affordance + callout */}
          <div className="w-full flex items-center justify-center gap-1.5 mb-1.5 text-[8px] font-black uppercase tracking-[0.3em] text-small-orange/80">
            <Pencil size={9} /> Edit title here
          </div>
          <div className="group/title relative w-full px-2 mb-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Untitled Project"
              aria-label="Project title"
              className="w-full min-w-0 text-center text-2xl lg:text-3xl font-display font-black tracking-tighter uppercase bg-transparent text-white placeholder:text-white/25 rounded-2xl pl-8 pr-8 py-2 border border-dashed border-white/15 hover:border-white/30 focus:border-small-orange focus:bg-white/[0.05] outline-none transition-all"
            />
            <Pencil size={13} className="absolute right-5 top-1/2 -translate-y-1/2 text-white/25 group-hover/title:text-small-orange group-focus-within/title:text-small-orange pointer-events-none transition-colors" />
          </div>
          <div className="group/artist relative w-full px-2 mb-8">
            <input
              type="text"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              placeholder="Artist Identity"
              aria-label="Artist / creator name"
              className="w-full min-w-0 text-center text-[11px] font-black uppercase tracking-[0.3em] bg-transparent text-white/70 placeholder:text-white/25 rounded-xl px-4 py-1.5 border border-dashed border-white/10 hover:border-white/25 focus:border-small-orange focus:bg-white/[0.05] outline-none transition-all"
            />
          </div>

          {/* Step progress */}
          <div className="w-full px-4 mb-8">
            <div className="flex items-center justify-between mb-3">
              {labels.map((label, i) => {
                const isActive = i === displayStep;
                const isDone = i < displayStep;
                return (
                  <button key={label} type="button" onClick={() => { setPageDir(i < displayStep ? -1 : 1); setStep(toLogical(i)); }} title={`Go to ${label}`} className="flex flex-col items-center gap-1.5 flex-1 group cursor-pointer bg-transparent border-0">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black transition-all group-hover:scale-110 ${isActive ? 'bg-white text-black scale-110' : isDone ? 'bg-green-500 text-white' : 'bg-white/10 text-white/30 group-hover:bg-white/25 group-hover:text-white/60'}`}>
                      {isDone ? <Check size={10} /> : i + 1}
                    </div>
                    <span className={`text-[7px] font-black uppercase tracking-wider transition-colors ${isActive ? 'text-white' : isDone ? 'text-green-500' : 'text-white/20 group-hover:text-white/50'}`}>{label}</span>
                  </button>
                );
              })}
            </div>
            <div className="h-0.5 bg-white/10 rounded-full">
              <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${(displayStep / (totalDisplaySteps - 1)) * 100}%` }} />
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            <label className="flex items-center gap-2 px-5 py-3 bg-white/5 hover:bg-white/10 rounded-full cursor-pointer border border-white/5 transition-all group active:scale-95">
              <ImageIcon size={12} className="text-white/30 group-hover:text-white" />
              <span className="text-[9px] font-black uppercase tracking-widest text-small-orange group-hover:text-white">Slideshow ({slideshow.length})</span>
              <input type="file" multiple className="hidden" accept="image/*" onChange={(e) => { const files = Array.from(e.target.files || []) as File[]; setSlideshowFiles(files); setSlideshow(files.map(f => URL.createObjectURL(f))); }} />
            </label>
            <button
              type="button"
              onClick={() => { setPageDir(step < 2 ? 1 : -1); setStep(2); setContentTab('videos'); }}
              className="flex items-center gap-2 px-5 py-3 bg-white/5 hover:bg-blue-500/20 rounded-full border border-white/5 hover:border-blue-500/30 transition-all group active:scale-95"
            >
              <VideoIcon size={12} className="text-white/30 group-hover:text-blue-400" />
              <span className="text-[9px] font-black uppercase tracking-widest text-small-orange group-hover:text-blue-300">Videos & BTS</span>
            </button>
            <label className="flex items-center gap-2 px-5 py-3 bg-white/5 hover:bg-white/10 rounded-full cursor-pointer border border-white/5 transition-all group active:scale-95">
              <User size={12} className="text-white/30 group-hover:text-white" />
              <span className="text-[9px] font-black uppercase tracking-widest text-small-orange group-hover:text-white">Profile Pix</span>
              <input type="file" className="hidden" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setArtistImage(URL.createObjectURL(f)); setArtistFile(f); } }} />
            </label>
          </div>

        </div>
        )}

        {/* Right Panel — Step Content */}
        <form onSubmit={handleSubmit} className={`flex-1 flex flex-col overflow-hidden ${isMobile ? '' : ''}`}>
          {/* Each step is its own page. mode="wait" => the old step fully leaves
              before the next arrives, so nothing ever overlaps. On mobile pages
              slide left↔right (and can be swiped); desktop cross-fades. */}
          <div className="flex-1 relative overflow-hidden">
            <AnimatePresence mode="wait" initial={false} custom={pageDir}>
              <motion.div
                key={step}
                custom={pageDir}
                initial={{ x: isMobile ? `${pageDir * 55}%` : 0, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: isMobile ? `${pageDir * -55}%` : 0, opacity: 0 }}
                transition={{ type: 'tween', duration: 0.26, ease: 'easeInOut' }}
                drag={isMobile ? 'x' : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.18}
                onDragEnd={(_e, info) => {
                  if (!isMobile) return;
                  if (info.offset.x < -80 && step < 7) goNext();
                  else if (info.offset.x > 80 && step > 0) goBack();
                }}
                className="absolute inset-0 overflow-y-auto custom-scrollbar p-5 sm:p-8 lg:p-10"
              >
                {stepContent[step]()}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Share This Album */}
          <div className="shrink-0 px-8 py-3 border-t border-white/5 bg-black/30 backdrop-blur-sm">
            <button
              type="button"
              onClick={async () => {
                const shareLink = initialAlbum?.id ? buildShareUrl('album', initialAlbum.id) : window.location.origin;
                const shareData = {
                  title: title || 'Check out this album on Plajah',
                  text: shareText(title, artist),
                  url: shareLink,
                };
                if (navigator.share) {
                  try { await navigator.share(shareData); } catch {}
                } else {
                  await navigator.clipboard.writeText(shareLink);
                }
              }}
              className="w-full flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,140,0,0.15)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,140,0,0.35)'; (e.currentTarget as HTMLButtonElement).style.color = '#FF8C00'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.12)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff'; }}
            >
              <Share2 size={14} />
              Share This Album
            </button>
          </div>

          {/* Navigation Footer */}
          <div className={`shrink-0 px-8 lg:px-16 py-6 border-t border-white/5 bg-black/30 backdrop-blur-sm flex items-center gap-4 ${isMobile ? 'pb-10' : ''}`}>
            {/* Persistent Save Now — save a draft from ANY step without leaving the editor. */}
            <button type="button" onClick={saveNow} disabled={isDeploying || !title.trim()}
              title="Save a draft now without closing"
              className={`shrink-0 flex items-center gap-2 px-5 py-4 rounded-full font-black text-[10px] uppercase tracking-widest border transition-all active:scale-95 disabled:opacity-30 ${savedFlash ? 'bg-green-500/15 border-green-500/40 text-green-300' : 'bg-small-orange/15 border-small-orange/40 text-small-orange hover:bg-small-orange/25'}`}>
              <Check size={14} className={savedFlash ? '' : 'opacity-70'} />
              {isDeploying ? 'Saving…' : savedFlash ? 'Saved' : 'Save Now'}
            </button>
            {/* Live autosave status */}
            {autosaveState !== 'idle' && !savedFlash && (
              <span className="shrink-0 hidden sm:flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-white/35">
                <span className={`w-1.5 h-1.5 rounded-full ${autosaveState === 'saving' ? 'bg-yellow-400 animate-pulse' : 'bg-green-400'}`} />
                {autosaveState === 'saving' ? 'Autosaving…' : 'All changes saved'}
              </span>
            )}
            {step > 0 && (
              <button type="button" onClick={goBack} className="flex items-center gap-2 px-8 py-4 bg-white/5 rounded-full text-white font-black text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all active:scale-95 border border-white/10">
                <ChevronLeft size={16} /> Back
              </button>
            )}
            {step < 7 ? (
              <button type="button" onClick={goNext} className="flex-1 flex items-center justify-center gap-2 py-5 bg-white text-black font-black uppercase tracking-[0.3em] text-sm rounded-full hover:scale-[1.02] transition-all shadow-2xl active:scale-95">
                {step === 0 ? (type ? `Continue with ${TYPE_OPTIONS.find(t => t.id === type)?.label}` : 'Select a Type') : 'Continue'} <ChevronRight size={18} />
              </button>
            ) : (
              <div className="flex-1 flex flex-col gap-3">
                {/* QC warning if tracks have failures */}
                {type === 'MUSIC' && tracks.length > 0 && (() => {
                  const vals = Object.values(qcResults);
                  const hasFailures = vals.some(r => r.status === 'fail');
                  const hasWarnings = vals.some(r => r.status === 'warn');
                  const unchecked = tracks.filter(t => t.url && !qcResults[t.id]).length;
                  if (hasFailures) return (
                    <div className="flex items-start gap-2.5 p-3.5 rounded-2xl text-[8px] font-black uppercase tracking-widest" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
                      <ShieldX size={12} className="shrink-0 mt-0.5" />
                      <span>QC failed on {vals.filter(r => r.status === 'fail').length} track{vals.filter(r => r.status === 'fail').length > 1 ? 's' : ''} — listeners may not hear audio. <button type="button" className="underline" onClick={() => { setStep(2); setContentTab('quality'); }}>Review in QC tab</button></span>
                    </div>
                  );
                  if (hasWarnings) return (
                    <div className="flex items-start gap-2.5 p-3.5 rounded-2xl text-[8px] font-black uppercase tracking-widest" style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', color: '#facc15' }}>
                      <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                      <span>QC warning on {vals.filter(r => r.status === 'warn').length} track{vals.filter(r => r.status === 'warn').length > 1 ? 's' : ''} — may have audio issues. <button type="button" className="underline" onClick={() => { setStep(2); setContentTab('quality'); }}>Review in QC tab</button></span>
                    </div>
                  );
                  if (unchecked > 0 && vals.length === 0) return (
                    <div className="flex items-start gap-2.5 p-3.5 rounded-2xl text-[8px] font-black uppercase tracking-widest" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.35)' }}>
                      <ShieldCheck size={12} className="shrink-0 mt-0.5" />
                      <span>Quality check not run — <button type="button" className="underline text-small-orange" onClick={() => { setStep(2); setContentTab('quality'); }}>run QC</button> to verify audio before publishing</span>
                    </div>
                  );
                  return null;
                })()}
                {!initialAlbum && (
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <button
                      type="button"
                      onClick={() => setRightsConfirmed(v => !v)}
                      className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${rightsConfirmed ? 'bg-small-orange border-small-orange' : 'border-white/30 group-hover:border-white/60'}`}
                    >
                      {rightsConfirmed && <Check size={12} className="text-white" />}
                    </button>
                    <span className="text-[9px] font-bold text-white/50 uppercase tracking-widest leading-relaxed">
                      I confirm I own or have full legal rights to distribute all files, images, and content uploaded here, including copyright. Uploading content you do not own violates our Terms of Service and may result in takedown and account suspension.
                    </span>
                  </label>
                )}
                {isFilm && (
                  <p className="text-center text-[9px] font-bold uppercase tracking-widest text-white/30 mb-3">Only a name &amp; creator are required — everything else is optional and editable anytime, before or after you publish.</p>
                )}
                <div className="flex flex-col sm:flex-row gap-3">
                  {/* Save as draft — persists the project (unlisted) to resume + refine later. */}
                  <button type="button" disabled={isDeploying || !title}
                    onClick={() => { saveAsDraftRef.current = true; handleSubmit(new Event('submit') as unknown as React.FormEvent); }}
                    className="sm:flex-shrink-0 px-6 py-5 bg-white/5 border border-white/15 text-white/70 font-black uppercase tracking-[0.3em] text-[11px] rounded-full transition-all hover:bg-white/10 disabled:opacity-30 active:scale-95">
                    {isDeploying ? 'Saving…' : 'Save Draft'}
                  </button>
                  <button type="submit" disabled={isDeploying || !title || (type === 'VIDEO' && !subType) || (isFilm && !artist.trim()) || (!initialAlbum && !isFilm && !rightsConfirmed)} title={type === 'VIDEO' && !subType ? 'Choose a video content type first' : undefined} className="flex-1 py-5 bg-white text-black font-black uppercase tracking-[0.5em] text-sm rounded-full transition-all hover:scale-[1.02] shadow-3xl disabled:opacity-30 active:scale-95">
                    {isDeploying ? (initialAlbum ? 'Updating Cloud...' : 'Deploying to Cloud...') : (type === 'VIDEO' && !subType) ? 'Set Content Type First' : (initialAlbum ? 'Save Changes' : 'Publish to Global Audience')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </form>
      </div>

      {/* ── Unsaved-changes leave guard ── */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" style={{ background: 'rgba(4,3,10,0.78)', backdropFilter: 'blur(6px)' }}>
          <div className="max-w-sm w-full bg-[#0b0710] border border-white/12 rounded-3xl p-7 text-center shadow-3xl">
            <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(255,140,0,0.12)', border: '1px solid rgba(255,140,0,0.3)' }}>
              <AlertTriangle size={26} className="text-small-orange" />
            </div>
            <h3 className="text-lg font-black uppercase tracking-widest mb-2">Unsaved Changes</h3>
            <p className="text-white/50 text-xs leading-relaxed mb-6">You have unsaved edits to this project. Save a draft before leaving, or discard your changes?</p>
            <div className="flex flex-col gap-2.5">
              <button type="button" disabled={isDeploying || !title.trim()}
                onClick={() => { setShowLeaveConfirm(false); saveAsDraftRef.current = true; handleSubmit(new Event('submit') as unknown as React.FormEvent); }}
                className="w-full py-3.5 bg-white text-black font-black uppercase tracking-widest text-[11px] rounded-full hover:scale-[1.02] transition-all disabled:opacity-30 active:scale-95">
                {isDeploying ? 'Saving…' : 'Save Draft & Close'}
              </button>
              <button type="button"
                onClick={() => { setShowLeaveConfirm(false); setIsDirty(false); onCancel?.(); }}
                className="w-full py-3.5 bg-red-500/10 border border-red-500/30 text-red-300 font-black uppercase tracking-widest text-[11px] rounded-full hover:bg-red-500/20 transition-all active:scale-95">
                Close Without Saving
              </button>
              <button type="button" onClick={() => setShowLeaveConfirm(false)}
                className="w-full py-3 text-white/40 font-black uppercase tracking-widest text-[10px] hover:text-white/70 transition-all">
                Keep Editing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tap-to-Sync overlay ── */}
      {tapSyncTrackId && (() => {
        const track = tracks.find(t => t.id === tapSyncTrackId);
        if (!track) return null;
        const lines = lyricLinesFor(track);   // falls back to the transcription
        if (lines.length === 0) return null;
        const pct = tapDuration > 0 ? (tapCurrentTime / tapDuration) * 100 : 0;
        const fmtT = (s: number) => { const m = Math.floor(s / 60); const ss = Math.floor(s % 60); return `${m}:${ss.toString().padStart(2,'0')}`; };
        const isDone = tapCurrentLine >= lines.length;

        return (
          <div className="fixed inset-0 z-[9999] flex flex-col bg-black/95 backdrop-blur-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Top bar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.07]">
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest text-small-orange mb-0.5">Tap to Sync</p>
                <p className="text-sm font-black uppercase tracking-tight text-white truncate max-w-xs">{track.title}</p>
              </div>
              <div className="flex items-center gap-2">
                {tapTimes.length > 0 && !isDone && (
                  <button type="button" onClick={() => closeTapSync(true)} className="px-4 py-2 bg-white/10 border border-white/15 rounded-full text-[8px] font-black uppercase tracking-widest text-white/60 hover:text-white transition-all">
                    Save Partial
                  </button>
                )}
                <button type="button" onClick={() => closeTapSync(false)} className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/40 hover:text-white transition-all">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Main area */}
            <div className="flex-1 flex flex-col items-center justify-center px-8 gap-8">
              {/* Line counter */}
              <div className="flex items-center gap-2">
                {lines.map((_: string, i: number) => (
                  <div key={i} className={`h-1 rounded-full transition-all ${i < tapCurrentLine ? 'bg-small-orange w-4' : i === tapCurrentLine ? 'bg-small-orange/60 w-6' : 'bg-white/10 w-2'}`} />
                ))}
              </div>

              {isDone ? (
                /* Completion state */
                <div className="text-center space-y-4">
                  <div className="w-20 h-20 rounded-full bg-small-orange/15 border-2 border-small-orange/40 flex items-center justify-center mx-auto">
                    <Check size={36} className="text-small-orange" />
                  </div>
                  <p className="text-xl font-black uppercase tracking-tight text-white">All {lines.length} lines synced!</p>
                  <p className="text-[10px] text-white/40 uppercase tracking-widest">Captions will be saved when you publish</p>
                  <button type="button" onClick={() => {
                    const timeCodedLyrics = lines.map((text: string, i: number) => ({ time: tapTimes[i] ?? 0, text: text.trim() }));
                    updateTrack(track.id, { timeCodedLyrics });
                    closeTapSync(false);
                  }} className="px-8 py-3 bg-small-orange text-black rounded-full text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all">
                    Save Sync →
                  </button>
                </div>
              ) : (
                /* Active sync state */
                <>
                  {/* Previous line (context) */}
                  {tapCurrentLine > 0 && (
                    <p className="text-[12px] text-white/15 font-bold uppercase tracking-wide text-center max-w-lg">
                      {lines[tapCurrentLine - 1]}
                    </p>
                  )}
                  {/* Current line — big + highlighted */}
                  <div className="text-center max-w-xl">
                    <p className="text-[10px] font-black uppercase tracking-widest text-small-orange/60 mb-3">
                      Line {tapCurrentLine + 1} of {lines.length}
                    </p>
                    <p className="text-3xl font-black uppercase tracking-tight text-white leading-tight">
                      {lines[tapCurrentLine]}
                    </p>
                  </div>
                  {/* Next line (preview) */}
                  {tapCurrentLine < lines.length - 1 && (
                    <p className="text-[12px] text-white/15 font-bold uppercase tracking-wide text-center max-w-lg">
                      {lines[tapCurrentLine + 1]}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Timeline + controls */}
            {!isDone && (
              <div className="px-8 pb-8 space-y-5">
                {/* Progress bar */}
                <div>
                  <div className="h-1 bg-white/10 rounded-full cursor-pointer" onClick={(e) => {
                    if (!tapAudioRef.current || tapDuration === 0) return;
                    const r = e.currentTarget.getBoundingClientRect();
                    tapAudioRef.current.currentTime = ((e.clientX - r.left) / r.width) * tapDuration;
                  }}>
                    <div className="h-full bg-small-orange rounded-full transition-none" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[7px] text-white/25 font-mono tabular-nums">{fmtT(tapCurrentTime)}</span>
                    <span className="text-[7px] text-white/25 font-mono tabular-nums">{fmtT(tapDuration)}</span>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-3">
                  {/* Restart */}
                  <button type="button" onClick={() => tapRestart(track)} className="p-3 rounded-2xl bg-white/5 border border-white/10 text-white/40 hover:text-white transition-all" title="Restart">
                    <SkipBack size={16} />
                  </button>
                  {/* Play / Pause */}
                  <button type="button" onClick={() => tapIsPlaying ? tapPause() : tapPlay(track)} className="p-4 rounded-2xl bg-white/10 border border-white/15 text-white hover:bg-white/20 transition-all" title={tapIsPlaying ? 'Pause' : 'Play'}>
                    {tapIsPlaying ? <Pause size={20} /> : <Play size={20} />}
                  </button>
                  {/* TAP button — the primary action */}
                  <button
                    type="button"
                    onClick={() => handleTap(track)}
                    disabled={!tapIsPlaying && tapCurrentTime === 0}
                    className="flex-1 py-4 rounded-2xl bg-small-orange text-black font-black text-base uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_0_32px_rgba(255,140,0,0.4)] disabled:opacity-40 disabled:cursor-not-allowed select-none"
                  >
                    ▸ TAP — "{lines[tapCurrentLine]?.substring(0, 30)}{(lines[tapCurrentLine]?.length ?? 0) > 30 ? '…' : ''}"
                  </button>
                </div>

                <p className="text-center text-[7.5px] text-white/20 uppercase tracking-widest">
                  Press TAP when you hear each lyric line start · {lines.length - tapCurrentLine} lines remaining
                </p>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
};

export default AlbumCreator;
