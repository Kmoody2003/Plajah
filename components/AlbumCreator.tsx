import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Album, Track, Video, VideoPlaylist, BookChapter, MovieMetadata, TVSeason, CastMember, ProductionCredit } from '../types';
import { generateAlbumMetadata, generateTrackLyrics } from '../services/geminiService';
import { publishToCloud, auth, fetchAllPublicAlbums, fetchUserWorlds, createIPWorld, addAssetToWorld, addCharactersToWorld, createCharacter, uploadFile as storageUpload } from '../services/backendService';
import { captureVideoFrame } from '../src/lib/videoUtils';
import {
  Upload, X, Image as ImageIcon, User, Sparkles, Globe, Video as VideoIcon, List, Plus, Trash2,
  Camera, Film, Tv, Info, Check, Layers, Settings, Twitter, Instagram, Youtube, Music2,
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Minimize2, BookOpen, Gamepad2, Mic2, GripVertical,
  Eye, EyeOff, Loader2
} from 'lucide-react';
import { useUpload } from '../contexts/UploadContext';

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

const MUSIC_SUBTYPES = ['ALBUM', 'SINGLE', 'EP', 'PODCAST'] as const;
const VIDEO_SUBTYPES = ['MOVIE', 'TV_SERIES', 'PODCAST'] as const;

// Step labels are computed dynamically in the component based on type + subType.

const hasSubtype = (t: AssetType) => t === 'MUSIC' || t === 'VIDEO';

const AlbumCreator: React.FC<AlbumCreatorProps> = ({ onCreated, onCancel, onMinimize, isMinimized, initialAlbum, initialType }) => {
  const resolvedInitialType: AssetType = (initialAlbum?.type as AssetType) || initialType || 'MUSIC';
  const [step, setStep] = useState(initialAlbum ? 3 : initialType ? 1 : 0);
  const [title, setTitle] = useState(initialAlbum?.title || '');
  const [artist, setArtist] = useState(initialAlbum?.artist || '');
  const [type, setType] = useState<AssetType>(resolvedInitialType);
  const [subType, setSubType] = useState<'MOVIE' | 'TV_SERIES' | 'GRAPHIC_NOVEL' | 'PODCAST' | 'NOVEL' | 'PLAYLIST' | undefined>(initialAlbum?.subType);
  const [genre, setGenre] = useState(initialAlbum?.genre || '');
  const [price, setPrice] = useState<number>(initialAlbum?.price || 0);
  const [isPaywalled, setIsPaywalled] = useState<boolean>(initialAlbum?.isPaywalled || false);
  const [artistBio, setArtistBio] = useState(initialAlbum?.artistBio || '');
  const [linerNotes, setLinerNotes] = useState(initialAlbum?.linerNotes || '');
  const [trackListLabel, setTrackListLabel] = useState(initialAlbum?.trackListLabel || '');
  const [artistImage, setArtistImage] = useState<string | undefined>(initialAlbum?.artistImage || undefined);
  const [artistFile, setArtistFile] = useState<File | undefined>(undefined);
  const [tracks, setTracks] = useState<Track[]>(initialAlbum?.tracks || []);
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
    /Mobi|Android|iPhone|iPad|iPod|IEMobile/i.test(navigator.userAgent) ||
    window.innerWidth < 1024;
  const [isMobile, setIsMobile] = useState(detectMobile);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState('');
  const [seasons, setSeasons] = useState<TVSeason[]>(initialAlbum?.seasons || []);
  const [relatedProjectIds, setRelatedProjectIds] = useState<string[]>(initialAlbum?.relatedProjectIds || []);
  const [publishToAudius, setPublishToAudius] = useState<boolean>(initialAlbum?.publishToAudius ?? false);
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

  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const handleResize = () => { clearTimeout(t); t = setTimeout(() => setIsMobile(detectMobile()), 150); };
    window.addEventListener('resize', handleResize, { passive: true });
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
  const skipStep1 = !hasSubtype(type);
  const skipStep4 = !hasCastStep;

  const labels = (() => {
    if (skipStep1) return ['Type', 'Content', 'World', 'Details', 'Settings', 'Tracks'];
    if (hasCastStep) return ['Type', 'Format', 'Content', 'World', 'Cast', 'Details', 'Settings', 'Tracks'];
    return ['Type', 'Format', 'Content', 'World', 'Details', 'Settings', 'Tracks'];
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

  const goNext = () => {
    if (step === 0) {
      setStep(skipStep1 ? 2 : 1);
    } else {
      const next = step + 1;
      setStep(next === 4 && skipStep4 ? 5 : Math.min(next, 7));
    }
  };
  const goBack = () => {
    if (step === 0) return;
    if (step === 2 && skipStep1) {
      setStep(0);
    } else if (step === 5 && skipStep4) {
      setStep(3);
    } else {
      setStep(s => Math.max(s - 1, 0));
    }
  };

  // ── File handlers ────────────────────────────────────────────────────────────
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
      for (const file of fileArray) {
        const isIamf = file.name.toLowerCase().endsWith('.iamf');
        if (isIamf || file.type.startsWith('audio/') || file.type.startsWith('video/')) {
          newTracks.push({
            id: Math.random().toString(36).substr(2, 9),
            title: file.name.replace(/\.[^/.]+$/, "").replace(/^\d+\s*[-_]*\s*/, ""),
            artist: artist || "Unknown Artist",
            file,
            url: URL.createObjectURL(file),
            price: 0,
            isPaywalled: false,
            genre,
            ...(isIamf && { isEclipsa: true }),
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
    }
  };

  const updateTrack = useCallback((id: string, updates: Partial<Track>) => {
    setTracks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

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
    setIsDeploying(true);
    setStatus({ text: initialAlbum ? "Updating Cloud Index..." : "Synthesizing Metadata...", percent: 5 });
    try {
      const trackNames = type === 'BOOK' ? bookChapters.map(c => c.title) : tracks.map(t => t.title);
      let description = initialAlbum?.description || "";
      let themeColor = initialAlbum?.themeColor || "#ffffff";
      if (!initialAlbum) {
        const metadata = await generateAlbumMetadata(title, trackNames);
        description = metadata.description;
        themeColor = metadata.themeColor;
        if (!linerNotes) setLinerNotes(metadata.linerNotes);
      }
      const albumId = initialAlbum?.id || `album_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

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

      const newAlbum: Album = {
        ...initialAlbum,
        id: albumId, title,
        artist: artist || "Unknown Artist",
        type: type as Album['type'],
        subType, genre, price, isPaywalled,
        artistBio: artistBio || `Exploring the boundaries of creativity as ${artist}.`,
        linerNotes,
        artistImage: artistImage || coverImage,
        artistFile, coverImage, coverFile, description, themeColor,
        tracks, slideshow, slideshowFiles, galleryUrl, socialLinks,
        musicVideos: type === 'VIDEO' && subType === 'MOVIE' ? musicVideos.map(v => ({ ...v, movieMetadata: finalMovieMetadata })) : musicVideos,
        videoPlaylists,
        seasons: type === 'VIDEO' && subType === 'TV_SERIES' ? seasons : undefined,
        movieMetadata: (type === 'VIDEO' && (subType === 'MOVIE' || subType === 'TV_SERIES')) ? finalMovieMetadata : undefined,
        bookChapters, bookPreviewConfig, allowPageSharing: type === 'BOOK' ? allowPageSharing : undefined, liveFeedUrl, donationGoal, tags, relatedProjectIds, trackListLabel: trackListLabel || undefined,
        gameUrl: type === 'GAME' ? gameUrl : undefined,
        gameVideoUrl: type === 'GAME' ? gameVideoUrl : undefined,
        gameScreenshots: type === 'GAME' ? gameScreenshots : undefined,
        gameFeatures: type === 'GAME' ? gameFeatures : undefined,
        createdAt: initialAlbum?.createdAt || Date.now(),
        isPublic: !isPrivate && !isDraft,
        isPrivate, isDraft, isScheduled, publishVideosToGallery, isSlideshowEnabled,
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
      };
      const publishedAlbum = await publishToCloud(newAlbum, (text, percent) => setStatus({ text, percent }));
      onCreated(typeof publishedAlbum === 'string' ? newAlbum : publishedAlbum);
    } catch (err: any) {
      console.error("Deployment Error:", err);
      alert(`Error: ${err?.message || "Deployment failed."}`);
    } finally {
      setIsDeploying(false);
    }
  };

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
    <div className="space-y-10 animate-in fade-in duration-300">
      <div>
        <h2 className="text-4xl font-display font-black tracking-tight uppercase mb-2">What are you creating?</h2>
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30">Choose a category to begin your workflow</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
        {TYPE_OPTIONS.map(({ id, label, desc, icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => { setType(id); setSubType(undefined); setStep(hasSubtype(id) ? 1 : 2); }}
            className={`flex flex-col items-start gap-5 p-8 rounded-[2.5rem] border transition-all text-left hover:scale-[1.02] active:scale-95 ${
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
      </div>
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-10 animate-in fade-in duration-300">
      <div>
        <h2 className="text-4xl font-display font-black tracking-tight uppercase mb-2">
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
            className={`flex flex-col gap-4 p-8 rounded-[2.5rem] border text-left transition-all hover:scale-[1.02] active:scale-95 ${
              subType === st ? 'bg-white text-black border-white shadow-2xl' : 'bg-white/5 border-white/10 hover:bg-white/10'
            }`}
          >
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${subType === st ? 'bg-black/10' : 'bg-white/5'}`}>
              {st === 'MOVIE' && <Film size={22} />}
              {st === 'TV_SERIES' && <Tv size={22} />}
              {st === 'PODCAST' && <Mic2 size={22} />}
              {st === 'ALBUM' && <Music2 size={22} />}
              {st === 'SINGLE' && <Music2 size={22} />}
              {st === 'EP' && <Music2 size={22} />}
            </div>
            <p className="text-sm font-black uppercase tracking-widest">{st.replace('_', ' ')}</p>
          </button>
        ))}
      </div>
      <p className="text-[9px] font-bold uppercase tracking-widest text-white/20">You can skip this — it helps organize your content</p>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-10 animate-in fade-in duration-300">
      <div>
        <h2 className="text-4xl font-display font-black tracking-tight uppercase mb-2">Upload Your Content</h2>
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30">
          {type === 'MUSIC' ? 'Add your audio tracks' :
           type === 'VIDEO' ? 'Upload your video content' :
           type === 'BOOK' ? 'Upload your manuscript or chapters' :
           type === 'PHOTO' ? 'Upload your photo collection' :
           'Upload your game files'}
        </p>
      </div>

      {/* Movie Upload */}
      {type === 'VIDEO' && subType === 'MOVIE' && (
        <div className="p-8 bg-white/5 rounded-[2.5rem] border border-white/10 space-y-8">
          <h3 className="text-base font-black uppercase tracking-widest flex items-center gap-3">
            <Film className="text-small-orange" size={20} /> Movie File & Metadata
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <label className="block p-8 bg-black/40 border-2 border-dashed border-white/10 rounded-3xl cursor-pointer hover:border-white/20 transition-all text-center group">
                <Upload size={28} className="mx-auto mb-4 text-white/20 group-hover:text-white transition-colors" />
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Main Movie File</p>
                <p className="text-[8px] font-bold text-white/20 mt-2">{tracks[0]?.url ? 'File Selected' : 'No file selected'}</p>
                <input type="file" className="hidden" accept="video/*" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) { const url = await uploadFile(file, 'VIDEO'); setTracks([{ id: 'movie', title, artist, url, duration: 0 }]); }
                }} />
              </label>
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
                        <input type="file" className="hidden" accept="video/*" onChange={async (e) => { const file = e.target.files?.[0]; if (file) { const url = await uploadFile(file, 'VIDEO'); const f = [...(movieMetadata.specialFeatures || [])]; f[idx].url = url; setMovieMetadata({ ...movieMetadata, specialFeatures: f }); } }} />
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
        <div className="p-8 bg-white/5 rounded-[2.5rem] border border-white/10 space-y-8">
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
                        <input type="file" className="hidden" accept="video/*" onChange={async (e) => { const file = e.target.files?.[0]; if (file) { const url = await uploadFile(file, 'VIDEO'); const s = [...seasons]; s[sIdx].episodes[eIdx].url = url; setSeasons(s); } }} />
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
          <div className="p-8 bg-white/5 rounded-[2.5rem] border border-white/10 space-y-6">
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
          <div className="p-8 bg-white/5 rounded-[2.5rem] border border-white/10 space-y-6">
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
                  <input type="file" className="hidden" accept="video/*" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) { const url = await uploadFile(file, 'VIDEO'); setGameVideoUrl(url); }
                  }} />
                </label>
              </div>
            </div>
          </div>

          {/* Screenshots */}
          <div className="p-8 bg-white/5 rounded-[2.5rem] border border-white/10 space-y-6">
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
          <div className="p-8 bg-white/5 rounded-[2.5rem] border border-white/10 space-y-6">
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
      {type !== 'GAME' && (type !== 'VIDEO' || !['MOVIE', 'TV_SERIES'].includes(subType || '')) && (
        <div className="space-y-4">
          <div className="relative group">
            <input type="file" multiple accept={type === 'BOOK' ? '.pdf,.epub,.txt,.cbz,.cbr,.docx,.rtf,.fb2,.html,.htm,.mobi,.azw,.azw3,.djvu' : type === 'VIDEO' ? 'video/*' : type === 'PHOTO' ? 'image/*' : 'audio/*,.iamf'} onChange={handleFolderSelect} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
            <div className="w-full py-16 border-2 border-dashed border-white/10 rounded-[3rem] flex flex-col items-center justify-center gap-6 group-hover:bg-white/[0.04] transition-all group-hover:border-white/20">
              <div className="p-6 rounded-[1.5rem] bg-white/5 text-white/40 group-hover:text-white transition-all shadow-2xl group-hover:scale-110 duration-500"><Upload size={32} /></div>
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
        <div className="p-8 bg-white/[0.03] border border-white/10 rounded-[3rem] space-y-6">
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
            <div key={chapter.id} className="flex flex-col gap-5 p-8 rounded-[2.5rem] bg-white/[0.03] border border-white/5 hover:bg-white/[0.05] transition-all">
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
                  <input type="text" value={chapter.title} onChange={(e) => setBookChapters(bookChapters.map(c => c.id === chapter.id ? { ...c, title: e.target.value } : c))} className="bg-transparent border-none focus:outline-none text-xl font-display font-black uppercase tracking-tight truncate flex-1 text-white placeholder:text-white/10" placeholder="Chapter Title" />
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

      {/* Track list (non-book) */}
      {type !== 'BOOK' && tracks.length > 0 && (
        <div className="space-y-5 max-h-[600px] overflow-y-auto pr-4 custom-scrollbar">
          {tracks.map((track, i) => (
            <div key={track.id} className="flex flex-col gap-5 p-8 rounded-[2.5rem] bg-white/[0.03] border border-white/5 hover:bg-white/[0.05] transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-5 overflow-hidden flex-1">
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-[11px] font-black text-small-orange border border-white/10">{i + 1}</div>
                  <input type="text" value={track.title} onChange={(e) => updateTrack(track.id, { title: e.target.value })} className="bg-transparent border-none focus:outline-none text-xl font-display font-black uppercase tracking-tight truncate flex-1 text-white placeholder:text-white/10" placeholder="Track Title" />
                </div>
                <button type="button" onClick={() => setTracks(tracks.filter(t => t.id !== track.id))} className="p-4 text-white/20 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-all"><Trash2 size={20} /></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/20">Price ($)</label>
                  <input type="number" step="0.01" value={track.price || 0} onChange={(e) => updateTrack(track.id, { price: parseFloat(e.target.value) })} className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-[10px] font-bold text-white outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/20">Options</label>
                  <div className="flex gap-2">
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
              {type === 'MUSIC' && (
                <>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[9px] font-black uppercase tracking-widest text-white/20">Lyrics</label>
                      <button type="button" onClick={async () => { setStatus({ text: `Generating lyrics...`, percent: 40 }); const lyricsArr = await (await import('../services/geminiService')).generateTrackLyrics(track.title, artist); updateTrack(track.id, { lyrics: lyricsArr.join('\n') }); setStatus({ text: "", percent: 0 }); }} className="flex items-center gap-2 text-[8px] font-black uppercase tracking-widest text-small-orange hover:text-white transition-colors"><Sparkles size={10} /> Sync AI Lyrics</button>
                    </div>
                    <textarea value={track.lyrics || ''} onChange={(e) => updateTrack(track.id, { lyrics: e.target.value })} placeholder="Paste or generate lyrics here..." className="w-full bg-black/40 border border-white/5 rounded-2xl p-5 text-[11px] font-medium text-white/80 outline-none h-28 resize-none" />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[9px] font-black uppercase tracking-widest text-white/20">Artist Notes (one per line)</label>
                    <textarea value={track.artistNotes?.join('\n') || ''} onChange={(e) => updateTrack(track.id, { artistNotes: e.target.value.split('\n').filter(n => n.trim() !== '') })} placeholder="Notes for your fans..." className="w-full bg-white/[0.04] border border-white/10 rounded-[1.5rem] px-6 py-4 text-white text-xs font-medium focus:outline-none h-20 resize-none" />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[9px] font-black uppercase tracking-widest text-white/20">Synced Lyrics (MM:SS text format)</label>
                    <textarea value={track.timeCodedLyrics?.map(l => { const m = Math.floor(l.time / 60); const s = Math.floor(l.time % 60); return `[${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}] ${l.text}`; }).join('\n') || ''} onChange={(e) => { const lines = e.target.value.split('\n'); const timeCoded = lines.map(line => { const match = line.match(/\[(\d+):(\d+)\]\s*(.*)/); return match ? { time: parseInt(match[1]) * 60 + parseInt(match[2]), text: match[3] } : null; }).filter(Boolean) as { time: number, text: string }[]; updateTrack(track.id, { timeCodedLyrics: timeCoded }); }} placeholder="[00:15] Lyric line here..." className="w-full bg-black/40 border border-white/5 rounded-2xl p-5 text-[10px] font-mono text-small-orange/80 outline-none h-36 resize-none" />
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Track Order Arrangement */}
      {type !== 'BOOK' && tracks.length > 1 && (
        <div className="p-8 bg-white/[0.03] border border-white/10 rounded-[3rem] space-y-6">
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

      {/* Music Videos section */}
      {(type === 'MUSIC' || (type === 'VIDEO' && !['MOVIE', 'TV_SERIES'].includes(subType || ''))) && (
        <div className="p-8 bg-white/[0.03] border border-white/10 rounded-[3rem] space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20"><VideoIcon size={20} className="text-blue-500" /></div>
            <h4 className="text-xs font-black uppercase tracking-widest">Visual Media & Music Videos</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-3">
              <label className="text-[9px] font-black uppercase tracking-widest text-white/20">Video Title</label>
              <input type="text" value={newVideoTitle} onChange={(e) => setNewVideoTitle(e.target.value)} placeholder="Cinematic Visual" className="w-full bg-white/[0.04] border border-white/10 rounded-[1.5rem] px-6 py-4 text-white font-bold focus:outline-none focus:ring-4 focus:ring-white/5 transition-all placeholder:text-white/10" />
            </div>
            <div className="space-y-3">
              <label className="text-[9px] font-black uppercase tracking-widest text-white/20">Video Source</label>
              <div className="flex gap-3">
                <input type="url" value={newVideoUrl} onChange={(e) => setNewVideoUrl(e.target.value)} placeholder="YouTube/Vimeo URL" className="flex-1 bg-white/[0.04] border border-white/10 rounded-[1.5rem] px-6 py-4 text-white font-bold focus:outline-none transition-all placeholder:text-white/10" />
                <label className="p-4 bg-white/5 rounded-[1.5rem] cursor-pointer hover:bg-white/10 transition-all flex items-center justify-center">
                  <Upload size={20} className="text-white/40" />
                  <input type="file" className="hidden" accept="video/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setNewVideoFile(f); setNewVideoUrl(f.name); } }} />
                </label>
              </div>
            </div>
          </div>
          <div className="flex flex-col md:flex-row items-center gap-4">
            <label className="flex-1 w-full flex items-center gap-4 p-4 bg-white/5 border border-dashed border-white/10 rounded-[1.5rem] cursor-pointer hover:bg-white/10 transition-all">
              <ImageIcon size={18} className="text-white/40 shrink-0" />
              <span className="text-[10px] font-black text-white/30 uppercase tracking-widest truncate">{newVideoThumb ? newVideoThumb.name : 'Thumbnail (Optional)'}</span>
              <input type="file" className="hidden" accept="image/*" onChange={(e) => setNewVideoThumb(e.target.files?.[0])} />
            </label>
            <label className="flex-1 w-full flex items-center gap-4 p-4 bg-white/5 border border-dashed border-white/10 rounded-[1.5rem] cursor-pointer hover:bg-white/10 transition-all">
              <ImageIcon size={18} className="text-white/40 shrink-0" />
              <span className="text-[10px] font-black text-white/30 uppercase tracking-widest truncate">{newVideoCover ? newVideoCover.name : 'Cover (Optional)'}</span>
              <input type="file" className="hidden" accept="image/*" onChange={(e) => setNewVideoCover(e.target.files?.[0])} />
            </label>
            <button type="button" disabled={!newVideoFile || isCapturing} onClick={async () => { if (!newVideoFile) return; setIsCapturing(true); try { const blob = await captureVideoFrame(newVideoFile); const f = new File([blob], 'thumb.jpg', { type: 'image/jpeg' }); setNewVideoThumb(f); setNewVideoCover(f); } catch {} finally { setIsCapturing(false); } }} className="p-4 bg-white/5 rounded-[1.5rem] text-white/40 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30" title="Auto-capture from video"><Camera size={20} /></button>
            <button type="button" onClick={async () => {
              if (!newVideoTitle || (!newVideoUrl && !newVideoFile)) return;
              let finalThumb = newVideoThumb, finalCover = newVideoCover;
              if (!finalThumb && newVideoFile) { try { const blob = await captureVideoFrame(newVideoFile); finalThumb = new File([blob], 'thumb.jpg', { type: 'image/jpeg' }); } catch {} }
              if (!finalCover && newVideoFile) { try { const blob = await captureVideoFrame(newVideoFile); finalCover = new File([blob], 'cover.jpg', { type: 'image/jpeg' }); } catch {} }
              setMusicVideos([...musicVideos, { id: Math.random().toString(36).substr(2, 9), ownerId: auth.currentUser?.uid || 'anonymous', title: newVideoTitle, url: newVideoUrl, file: newVideoFile, thumbnailFile: finalThumb, thumbnailUrl: finalThumb ? URL.createObjectURL(finalThumb) : undefined, coverImageFile: finalCover, coverImageUrl: finalCover ? URL.createObjectURL(finalCover) : undefined, timestamp: Date.now() }]);
              setNewVideoTitle(''); setNewVideoUrl(''); setNewVideoFile(undefined); setNewVideoThumb(undefined); setNewVideoCover(undefined);
            }} className="px-8 py-4 bg-white text-black rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all shadow-2xl active:scale-95 whitespace-nowrap">Add Video</button>
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
              <input type="text" value={newPlaylistTitle} onChange={(e) => setNewPlaylistTitle(e.target.value)} placeholder="Playlist Name (e.g. Live Sessions)" className="flex-1 bg-white/[0.04] border border-white/10 rounded-[1.5rem] px-6 py-4 text-white font-bold focus:outline-none focus:ring-4 focus:ring-white/5 transition-all placeholder:text-white/10" />
              <button type="button" onClick={() => { if (newPlaylistTitle) { setVideoPlaylists([...videoPlaylists, { id: Math.random().toString(36).substr(2, 9), ownerId: auth.currentUser?.uid || 'anonymous', title: newPlaylistTitle, videoIds: [], isPublic: true, timestamp: Date.now() }]); setNewPlaylistTitle(''); } }} className="px-6 py-4 bg-white/10 rounded-[1.5rem] text-white font-black text-[10px] uppercase tracking-widest hover:bg-white/20 transition-all">Create</button>
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
    <div className="space-y-10 animate-in fade-in duration-300">
      <div>
        <h2 className="text-4xl font-display font-black tracking-tight uppercase mb-2">Connect to a World</h2>
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30">Link this project to a world or universe — all optional</p>
      </div>

      {/* World assignment */}
      <div className="grid grid-cols-1 gap-4">
        <button type="button" onClick={() => { setWorldAssignment('STANDALONE'); setWorldId(undefined); }}
          className={`flex items-start gap-6 p-8 rounded-[2.5rem] border text-left transition-all hover:scale-[1.01] active:scale-95 ${worldAssignment === 'STANDALONE' ? 'bg-white text-black border-white shadow-2xl' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
          <div className={`p-4 rounded-2xl shrink-0 ${worldAssignment === 'STANDALONE' ? 'bg-black/10' : 'bg-white/5'}`}><Globe size={26} /></div>
          <div>
            <p className="text-sm font-black uppercase tracking-widest mb-1">Standalone</p>
            <p className={`text-[10px] font-bold uppercase tracking-widest leading-relaxed ${worldAssignment === 'STANDALONE' ? 'text-black/50' : 'text-white/30'}`}>No world connection. This project stands on its own.</p>
          </div>
          {worldAssignment === 'STANDALONE' && <Check size={20} className="ml-auto shrink-0 mt-1" />}
        </button>

        <button type="button" onClick={() => setWorldAssignment('NEW')}
          className={`flex flex-col gap-5 p-8 rounded-[2.5rem] border text-left transition-all hover:scale-[1.01] active:scale-95 ${worldAssignment === 'NEW' ? 'bg-white text-black border-white shadow-2xl' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
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
          className={`flex flex-col gap-5 p-8 rounded-[2.5rem] border text-left transition-all hover:scale-[1.01] active:scale-95 ${worldAssignment === 'EXISTING' ? 'bg-white text-black border-white shadow-2xl' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
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
      <div className="p-8 bg-white/[0.03] border border-white/10 rounded-[3rem] space-y-6">
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
    <div className="space-y-10 animate-in fade-in duration-300">
      <div>
        <h2 className="text-4xl font-display font-black tracking-tight uppercase mb-2">Cast & Production</h2>
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30">Add actors, link them to characters, and credit production talent</p>
      </div>

      {/* Cast */}
      <div className="p-8 bg-white/[0.03] border border-white/10 rounded-[3rem] space-y-6">
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
      <div className="p-8 bg-white/[0.03] border border-white/10 rounded-[3rem] space-y-6">
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
    <div className="space-y-10 animate-in fade-in duration-300">
      <div>
        <h2 className="text-4xl font-display font-black tracking-tight uppercase mb-2">Project Details</h2>
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30">Name your project and tell your story</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <label className="block text-[10px] font-black uppercase tracking-[0.4em] text-small-orange opacity-60">
            {type === 'BOOK' ? 'Book Title' : type === 'PHOTO' ? 'Collection Name' : type === 'GAME' ? 'Game Title' : 'Project Title'}
          </label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Project Name" className="w-full bg-white/[0.04] border border-white/10 rounded-[1.5rem] px-8 py-5 text-white font-bold focus:outline-none focus:ring-4 focus:ring-white/5 transition-all placeholder:text-white/10" required />
        </div>
        <div className="space-y-3">
          <label className="block text-[10px] font-black uppercase tracking-[0.4em] text-small-orange opacity-60">
            {type === 'BOOK' ? 'Author Name' : type === 'GAME' ? 'Developer / Studio' : 'Creator Identity'}
          </label>
          <input type="text" value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Creator Name" className="w-full bg-white/[0.04] border border-white/10 rounded-[1.5rem] px-8 py-5 text-white font-bold focus:outline-none focus:ring-4 focus:ring-white/5 transition-all placeholder:text-white/10" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <label className="block text-[10px] font-black uppercase tracking-[0.4em] text-small-orange opacity-60">Primary Genre</label>
          <select value={genre} onChange={(e) => setGenre(e.target.value)} className="w-full bg-white/[0.04] border border-white/10 rounded-[1.5rem] px-8 py-5 text-white font-bold focus:outline-none focus:ring-4 focus:ring-white/5 transition-all appearance-none">
            <option value="" className="bg-[#0a0a0a]">Select Genre</option>
            {genreOptions[type].map(g => <option key={g} value={g} className="bg-[#0a0a0a]">{g}</option>)}
            <option value="Other" className="bg-[#0a0a0a]">Other</option>
          </select>
        </div>
        <div className="space-y-3">
          <label className="block text-[10px] font-black uppercase tracking-[0.4em] text-small-orange opacity-60">Project Tags</label>
          <div className="flex gap-3">
            <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), tagInput.trim() && (setTags([...tags, tagInput.trim()]), setTagInput('')))} placeholder="Add a tag..." className="flex-1 bg-white/[0.04] border border-white/10 rounded-[1.5rem] px-6 py-4 text-white font-bold focus:outline-none focus:ring-4 focus:ring-white/5 transition-all placeholder:text-white/10" />
            <button type="button" onClick={() => { if (tagInput.trim()) { setTags([...tags, tagInput.trim()]); setTagInput(''); } }} className="px-6 py-4 bg-white/5 rounded-[1.5rem] text-white font-black text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all">Add</button>
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
        <textarea value={artistBio} onChange={(e) => setArtistBio(e.target.value)} placeholder="The story behind this project..." className="w-full bg-white/[0.04] border border-white/10 rounded-[1.5rem] px-8 py-6 text-white font-medium focus:outline-none focus:ring-4 focus:ring-white/5 transition-all h-32 resize-none placeholder:text-white/10" />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="block text-[10px] font-black uppercase tracking-[0.4em] text-small-orange opacity-60">
            {type === 'BOOK' ? 'Credits & Acknowledgements' : 'Liner Notes (Lyrics / Credits / Technical)'}
          </label>
          <button type="button" onClick={async () => { const trackNames = type === 'BOOK' ? bookChapters.map(c => c.title) : tracks.map(t => t.title); const notes = await (await import('../services/geminiService')).generateLinerNotes(title, artist, trackNames); setLinerNotes(notes); }} className="flex items-center gap-2 text-[8px] font-black uppercase tracking-widest text-small-orange hover:scale-105 transition-all"><Sparkles size={10} /> Generate AI Liner Notes</button>
        </div>
        <textarea value={linerNotes} onChange={(e) => setLinerNotes(e.target.value)} placeholder="Deep technical details, recording credits, or full project notes..." className="w-full bg-white/[0.04] border border-white/10 rounded-[1.5rem] px-8 py-6 text-white font-medium focus:outline-none focus:ring-4 focus:ring-white/5 transition-all h-32 resize-none placeholder:text-white/10" />
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
            className="w-full bg-white/[0.04] border border-white/10 rounded-[1.5rem] px-8 py-5 text-white font-bold focus:outline-none focus:ring-4 focus:ring-white/5 transition-all placeholder:text-white/10"
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
    <div className="space-y-10 animate-in fade-in duration-300">
      <div>
        <h2 className="text-4xl font-display font-black tracking-tight uppercase mb-2">Settings & Publishing</h2>
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30">Configure pricing, visibility, and distribution</p>
      </div>

      {/* Project Gallery / Slideshow */}
      <div className="p-8 bg-white/5 rounded-[2.5rem] border border-white/10 space-y-6">
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
            <div key={i} className="group relative aspect-square rounded-[1.5rem] overflow-hidden border border-white/10 bg-white/5">
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

      {/* Pricing */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <label className="block text-[10px] font-black uppercase tracking-[0.4em] text-small-orange opacity-60">Full Project Price ($)</label>
          <div className="flex items-center gap-3">
            <input type="number" step="0.01" value={price} onChange={(e) => setPrice(parseFloat(e.target.value))} placeholder="0.00" className="flex-1 bg-white/[0.04] border border-white/10 rounded-[1.5rem] px-8 py-5 text-white font-bold focus:outline-none focus:ring-4 focus:ring-white/5 transition-all placeholder:text-white/10" />
            <button type="button" onClick={() => setIsPaywalled(!isPaywalled)} className={`px-6 py-5 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest border transition-all ${isPaywalled ? 'bg-small-orange text-white border-small-orange shadow-xl' : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'}`}>{isPaywalled ? 'Paywalled' : 'Free'}</button>
          </div>
        </div>
        <div className="space-y-3">
          <label className="block text-[10px] font-black uppercase tracking-[0.4em] text-small-orange opacity-60">Gifts & Tips Goal ($)</label>
          <input type="number" value={donationGoal} onChange={(e) => setDonationGoal(parseFloat(e.target.value))} placeholder="e.g. 500.00" className="w-full bg-white/[0.04] border border-white/10 rounded-[1.5rem] px-8 py-5 text-white font-bold focus:outline-none focus:ring-4 focus:ring-white/5 transition-all placeholder:text-white/10" />
        </div>
      </div>

      <div className="space-y-3">
        <label className="block text-[10px] font-black uppercase tracking-[0.4em] text-small-orange opacity-60">Gallery Experience URL (Optional)</label>
        <input type="url" value={galleryUrl} onChange={(e) => setGalleryUrl(e.target.value)} placeholder="https://your-custom-gallery.com" className="w-full bg-white/[0.04] border border-white/10 rounded-[1.5rem] px-8 py-5 text-white font-bold focus:outline-none focus:ring-4 focus:ring-white/5 transition-all placeholder:text-white/10" />
      </div>

      <div className="space-y-3">
        <label className="block text-[10px] font-black uppercase tracking-[0.4em] text-small-orange opacity-60">Live Video Feed URL</label>
        <input type="url" value={liveFeedUrl} onChange={(e) => setLiveFeedUrl(e.target.value)} placeholder="YouTube Live / Twitch Embed URL" className="w-full bg-white/[0.04] border border-white/10 rounded-[1.5rem] px-8 py-5 text-white font-bold focus:outline-none focus:ring-4 focus:ring-white/5 transition-all placeholder:text-white/10" />
      </div>

      {/* Toggles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="p-6 bg-white/[0.03] border border-white/10 rounded-[2.5rem] space-y-4">
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
        </div>

        {type === 'MUSIC' && (
          <div className="p-6 rounded-[2.5rem] space-y-3"
            style={{ background: publishToAudius ? 'rgba(126,34,206,0.12)' : 'rgba(255,255,255,0.03)', border: publishToAudius ? '1px solid rgba(168,85,247,0.4)' : '1px solid rgba(255,255,255,0.1)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center border"
                  style={{ background: 'rgba(126,34,206,0.15)', borderColor: 'rgba(168,85,247,0.3)' }}>
                  <Music2 size={18} style={{ color: '#a855f7' }} />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-widest">Publish to Audius</h4>
                  <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'rgba(168,85,247,0.7)' }}>Decentralized · Artist earns on every stream</p>
                </div>
              </div>
              <button type="button" onClick={() => setPublishToAudius(!publishToAudius)}
                className="w-12 h-7 rounded-full transition-all relative shrink-0"
                style={{ background: publishToAudius ? '#7e22ce' : 'rgba(255,255,255,0.1)' }}>
                <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full transition-all ${publishToAudius ? 'left-5' : 'left-0.5'}`} />
              </button>
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

        {type === 'VIDEO' && (
          <div className="p-6 bg-white/[0.03] border border-white/10 rounded-[2.5rem]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-2xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20"><VideoIcon size={18} className="text-small-orange" /></div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-widest">Surface in Video Gallery</h4>
                  <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest">Mirror videos to gallery</p>
                </div>
              </div>
              <button type="button" onClick={() => setPublishVideosToGallery(!publishVideosToGallery)} className={`w-12 h-7 rounded-full transition-all relative shrink-0 ${publishVideosToGallery ? 'bg-small-orange' : 'bg-white/10'}`}>
                <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full transition-all ${publishVideosToGallery ? 'left-5' : 'left-0.5'}`} />
              </button>
            </div>
          </div>
        )}

        <div className="p-6 bg-white/[0.03] border border-white/10 rounded-[2.5rem] space-y-4">
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
              <input type="datetime-local" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} className="w-full bg-white/[0.04] border border-white/10 rounded-[1.5rem] px-6 py-4 text-white text-xs font-bold focus:outline-none focus:ring-4 focus:ring-white/5 transition-all" />
            </div>
          )}
        </div>
      </div>

      {/* Related Projects */}
      <div className="p-8 bg-white/[0.03] border border-white/10 rounded-[3rem] space-y-6">
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
    <div className="space-y-10 animate-in fade-in duration-300">
      <div>
        <h2 className="text-4xl font-display font-black tracking-tight uppercase mb-2">Track Management</h2>
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30">Arrange, rename, and configure Hide &amp; Seek for each track</p>
      </div>

      {/* HnS Master Controls */}
      <div className="p-8 bg-white/[0.03] border border-white/10 rounded-[2.5rem] space-y-6">
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

      {/* Track List — rename, reorder, HnS slots */}
      {tracks.length === 0 ? (
        <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-[2.5rem] opacity-30">
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
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button type="button" disabled={i === 0} onClick={() => { const r = [...tracks]; [r[i-1], r[i]] = [r[i], r[i-1]]; setTracks(r); }} className="p-1 text-white/20 hover:text-white disabled:opacity-10 transition-colors rounded"><ChevronUp size={12} /></button>
                  <button type="button" disabled={i === tracks.length - 1} onClick={() => { const r = [...tracks]; [r[i+1], r[i]] = [r[i], r[i+1]]; setTracks(r); }} className="p-1 text-white/20 hover:text-white disabled:opacity-10 transition-colors rounded"><ChevronDown size={12} /></button>
                </div>
              </div>

              {/* HnS Slot uploads */}
              {hnsEnabled && (
                <div className="px-5 pb-5 pt-2 space-y-2 border-t border-white/5">
                  <p className="text-[8px] font-black uppercase tracking-widest text-white/20 mb-2">Alternate Slots</p>
                  {([1, 2] as const).map(slot => {
                    const slotKey = `hnsSlot${slot}` as 'hnsSlot1' | 'hnsSlot2';
                    const existing = (track as any)[slotKey];
                    const key = `${track.id}_slot${slot}`;
                    const uploading = hnsSlotUploading === key;
                    const progress = hnsSlotProgress[key] ?? 0;
                    const saved = hnsSlotSaved === key;
                    return (
                      <label key={slot} className={`flex flex-col gap-1.5 p-3 rounded-xl border cursor-pointer transition-all ${existing ? 'border-small-orange/30 bg-small-orange/5 hover:bg-small-orange/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[9px] font-black ${existing ? 'bg-small-orange/20 text-small-orange' : 'bg-white/5 text-white/30'}`}>
                            {uploading ? <Loader2 size={11} className="animate-spin" /> : saved ? <Check size={11} className="text-green-400" /> : `S${slot}`}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Slot {slot}</p>
                            <p className="text-[10px] font-bold truncate">{saved ? 'Saved!' : existing ? existing.title : 'Click to upload alternate…'}</p>
                          </div>
                          {!uploading && !saved && <Upload size={11} className="text-white/20 shrink-0" />}
                        </div>
                        {uploading && (
                          <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full bg-small-orange rounded-full transition-all duration-200" style={{ width: `${progress}%` }} />
                          </div>
                        )}
                        <input type="file" accept="audio/*,video/*" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCreatorHnsSlotUpload(track, slot, f); }} />
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const stepContent = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4, renderStep5, renderStep6, renderStep7];

  return (
    <div className="fixed inset-0 bg-black/95 backdrop-blur-3xl flex items-center justify-center z-[200] p-4 md:p-8">
      <div className="max-w-6xl w-full bg-[#0a0a0a] border border-white/10 rounded-[3rem] overflow-hidden flex flex-col lg:flex-row shadow-3xl h-full lg:h-[90vh] max-h-[1000px] animate-in zoom-in-95 duration-300">

        {/* Deploy Overlay */}
        {isDeploying && (
          <div className="absolute inset-0 z-[300] bg-black/90 backdrop-blur-2xl flex flex-col items-center justify-center p-20 text-center animate-in fade-in duration-500">
            <div className="w-40 h-40 relative mb-16">
              <div className="absolute inset-0 border-8 border-white/5 rounded-full" />
              <div className="absolute inset-0 border-8 border-white rounded-full border-t-transparent animate-spin" style={{ animationDuration: '2s' }} />
              <Sparkles className="absolute inset-0 m-auto text-white" size={48} />
            </div>
            <h2 className="text-4xl lg:text-5xl font-display font-black tracking-tighter mb-6 uppercase">{status.text}</h2>
            <div className="w-full max-w-lg h-2 bg-white/10 rounded-full overflow-hidden mb-6 shadow-inner">
              <div className="h-full bg-green-500 transition-all duration-700 shadow-[0_0_30px_rgba(34,197,94,0.8)]" style={{ width: `${status.percent}%` }} />
            </div>
            <p className="text-xs font-black uppercase tracking-[0.5em] text-white/40">{status.percent}% SYNCHRONIZED WITH GLOBAL CLOUD</p>
          </div>
        )}

        {/* Left Panel — Cover Art */}
        <div className="lg:w-[35%] p-8 bg-white/[0.03] flex flex-col items-center justify-center text-center border-b lg:border-b-0 lg:border-r border-white/5 relative shrink-0">
          <div className="absolute top-8 left-8 flex items-center gap-2">
            <button type="button" onClick={onCancel} className="p-4 bg-white/5 rounded-[1.5rem] text-white/40 hover:text-white hover:bg-white/10 transition-all active:scale-90"><X size={24} /></button>
            {onMinimize && <button type="button" onClick={onMinimize} className="p-4 bg-white/5 rounded-[1.5rem] text-white/40 hover:text-white hover:bg-white/10 transition-all active:scale-90"><Minimize2 size={24} /></button>}
          </div>

          <div className="relative group mb-8">
            <div className="w-56 h-56 lg:w-72 lg:h-72 rounded-[3rem] overflow-hidden shadow-3xl ring-2 ring-white/10 transition-transform group-hover:scale-105 duration-500">
              <img src={coverImage || undefined} alt="Cover" className="w-full h-full object-cover" />
            </div>
            <label className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-all cursor-pointer rounded-[3rem] backdrop-blur-md">
              <div className="flex flex-col items-center gap-3">
                <div className="p-4 bg-white text-black rounded-2xl shadow-2xl"><ImageIcon size={32} /></div>
                <span className="text-[10px] font-black uppercase tracking-widest">Update Artwork</span>
              </div>
              <input type="file" className="hidden" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setCoverImage(URL.createObjectURL(f)); setCoverFile(f); } }} />
            </label>
          </div>

          <h3 className="text-3xl font-display font-black mb-2 tracking-tighter truncate w-full px-6 uppercase">{title || "Untitled Project"}</h3>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 truncate w-full px-6 mb-8">{artist || "Artist Identity"}</p>

          {/* Step progress */}
          <div className="w-full px-4 mb-8">
            <div className="flex items-center justify-between mb-3">
              {labels.map((label, i) => {
                const isActive = i === displayStep;
                const isDone = i < displayStep;
                return (
                  <div key={label} className="flex flex-col items-center gap-1.5 flex-1">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black transition-all ${isActive ? 'bg-white text-black scale-110' : isDone ? 'bg-green-500 text-white' : 'bg-white/10 text-white/30'}`}>
                      {isDone ? <Check size={10} /> : i + 1}
                    </div>
                    <span className={`text-[7px] font-black uppercase tracking-wider ${isActive ? 'text-white' : isDone ? 'text-green-500' : 'text-white/20'}`}>{label}</span>
                  </div>
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
            <label className="flex items-center gap-2 px-5 py-3 bg-white/5 hover:bg-white/10 rounded-full cursor-pointer border border-white/5 transition-all group active:scale-95">
              <User size={12} className="text-white/30 group-hover:text-white" />
              <span className="text-[9px] font-black uppercase tracking-widest text-small-orange group-hover:text-white">Profile Pix</span>
              <input type="file" className="hidden" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setArtistImage(URL.createObjectURL(f)); setArtistFile(f); } }} />
            </label>
          </div>
        </div>

        {/* Right Panel — Step Content */}
        <form onSubmit={handleSubmit} className={`flex-1 flex flex-col overflow-hidden ${isMobile ? '' : ''}`}>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-8 lg:p-16">
            {stepContent[step]()}
          </div>

          {/* Navigation Footer */}
          <div className={`shrink-0 px-8 lg:px-16 py-6 border-t border-white/5 bg-[#0a0a0a] flex items-center gap-4 ${isMobile ? 'pb-10' : ''}`}>
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
                <button type="submit" disabled={isDeploying || !title || (!initialAlbum && !rightsConfirmed)} className="w-full py-5 bg-white text-black font-black uppercase tracking-[0.5em] text-sm rounded-full transition-all hover:scale-[1.02] shadow-3xl disabled:opacity-30 active:scale-95">
                  {isDeploying ? (initialAlbum ? 'Updating Cloud...' : 'Deploying to Cloud...') : (initialAlbum ? 'Save Changes' : 'Publish to Global Audience')}
                </button>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default AlbumCreator;
