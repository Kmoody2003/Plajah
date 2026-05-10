import React, { useState, useEffect, useCallback } from 'react';
import { Album, Track, Video, VideoPlaylist, BookChapter, MovieMetadata, TVSeason } from '../types';
import { generateAlbumMetadata, generateTrackLyrics } from '../services/geminiService';
import { publishToCloud, auth, fetchAllPublicAlbums } from '../services/backendService';
import { captureVideoFrame } from '../src/lib/videoUtils';
import {
  Upload, X, Image as ImageIcon, User, Sparkles, Globe, Video as VideoIcon, List, Plus, Trash2,
  Camera, Film, Tv, Info, Check, Layers, Settings, Twitter, Instagram, Youtube, Music2,
  ChevronLeft, ChevronRight, Minimize2, BookOpen, Gamepad2, Mic2
} from 'lucide-react';
import { useUpload } from '../contexts/UploadContext';

interface AlbumCreatorProps {
  onCreated: (album: Album) => void;
  onCancel: () => void;
  onMinimize?: () => void;
  isMinimized?: boolean;
  initialAlbum?: Album;
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

const STEP_LABELS: Record<AssetType, string[]> = {
  MUSIC:  ['Type', 'Format', 'Content', 'Details', 'Settings'],
  VIDEO:  ['Type', 'Format', 'Content', 'Details', 'Settings'],
  BOOK:   ['Type', 'Content', 'Details', 'Settings'],
  PHOTO:  ['Type', 'Content', 'Details', 'Settings'],
  GAME:   ['Type', 'Content', 'Details', 'Settings'],
};

const hasSubtype = (t: AssetType) => t === 'MUSIC' || t === 'VIDEO';

const AlbumCreator: React.FC<AlbumCreatorProps> = ({ onCreated, onCancel, onMinimize, isMinimized, initialAlbum }) => {
  const [step, setStep] = useState(initialAlbum ? 3 : 0);
  const [title, setTitle] = useState(initialAlbum?.title || '');
  const [artist, setArtist] = useState(initialAlbum?.artist || '');
  const [type, setType] = useState<AssetType>((initialAlbum?.type as AssetType) || 'MUSIC');
  const [subType, setSubType] = useState<'MOVIE' | 'TV_SERIES' | 'GRAPHIC_NOVEL' | 'PODCAST' | 'NOVEL' | 'PLAYLIST' | undefined>(initialAlbum?.subType);
  const [genre, setGenre] = useState(initialAlbum?.genre || '');
  const [price, setPrice] = useState<number>(initialAlbum?.price || 0);
  const [isPaywalled, setIsPaywalled] = useState<boolean>(initialAlbum?.isPaywalled || false);
  const [artistBio, setArtistBio] = useState(initialAlbum?.artistBio || '');
  const [linerNotes, setLinerNotes] = useState(initialAlbum?.linerNotes || '');
  const [artistImage, setArtistImage] = useState<string | undefined>(initialAlbum?.artistImage || undefined);
  const [artistFile, setArtistFile] = useState<File | undefined>(undefined);
  const [tracks, setTracks] = useState<Track[]>(initialAlbum?.tracks || []);
  const [coverImage, setCoverImage] = useState(initialAlbum?.coverImage || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=1000&auto=format&fit=crop');
  const [coverFile, setCoverFile] = useState<File | undefined>(undefined);
  const [slideshow, setSlideshow] = useState<string[]>(initialAlbum?.slideshow || []);
  const [slideshowFiles, setSlideshowFiles] = useState<File[]>([]);
  const [bookChapters, setBookChapters] = useState<BookChapter[]>(initialAlbum?.bookChapters || []);
  const [bookPreviewConfig, setBookPreviewConfig] = useState(initialAlbum?.bookPreviewConfig || { type: 'PAGES' as const, allowedPageRange: [1, 5] as [number, number] });
  const [isDeploying, setIsDeploying] = useState(false);
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
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState('');
  const [seasons, setSeasons] = useState<TVSeason[]>(initialAlbum?.seasons || []);
  const [relatedProjectIds, setRelatedProjectIds] = useState<string[]>(initialAlbum?.relatedProjectIds || []);
  const [availableAlbums, setAvailableAlbums] = useState<Album[]>([]);
  const [movieMetadata, setMovieMetadata] = useState<MovieMetadata>(initialAlbum?.movieMetadata || {
    cast: [], crew: [], trailerUrl: '', releaseYear: new Date().getFullYear(), specialFeatures: []
  });

  const { uploadFile } = useUpload();

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const handleResize = () => { clearTimeout(t); t = setTimeout(() => setIsMobile(window.innerWidth < 1024), 150); };
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

  // ── Navigation ──────────────────────────────────────────────────────────────
  const labels = STEP_LABELS[type];
  // Map logical step index to display step (skip subtype row for non-music/video)
  const toLogical = (display: number) => {
    if (!hasSubtype(type) && display >= 1) return display + 1; // skip step 1
    return display;
  };
  const toDisplay = (logical: number) => {
    if (!hasSubtype(type) && logical >= 2) return logical - 1;
    return logical;
  };
  const totalDisplaySteps = labels.length;
  const displayStep = toDisplay(step);

  const goNext = () => {
    if (step === 0) {
      setStep(hasSubtype(type) ? 1 : 2);
    } else {
      setStep(s => Math.min(s + 1, 4));
    }
  };
  const goBack = () => {
    if (step === 2 && !hasSubtype(type)) {
      setStep(0);
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
      const newChapters: BookChapter[] = [];
      for (const file of fileArray) {
        if (file.type === 'application/pdf' || file.type === 'application/epub+zip' || file.type === 'text/plain') {
          newChapters.push({
            id: Math.random().toString(36).substr(2, 9),
            title: file.name.replace(/\.[^/.]+$/, "").replace(/^\d+\s*[-_]*\s*/, ""),
            url: URL.createObjectURL(file),
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
        if (file.type.startsWith('audio/') || file.type.startsWith('video/')) {
          newTracks.push({
            id: Math.random().toString(36).substr(2, 9),
            title: file.name.replace(/\.[^/.]+$/, "").replace(/^\d+\s*[-_]*\s*/, ""),
            artist: artist || "Unknown Artist",
            file,
            url: URL.createObjectURL(file),
            price: 0,
            isPaywalled: false,
            genre
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
        musicVideos: type === 'VIDEO' && subType === 'MOVIE' ? musicVideos.map(v => ({ ...v, movieMetadata })) : musicVideos,
        videoPlaylists,
        seasons: type === 'VIDEO' && subType === 'TV_SERIES' ? seasons : undefined,
        bookChapters, bookPreviewConfig, liveFeedUrl, donationGoal, tags, relatedProjectIds,
        createdAt: initialAlbum?.createdAt || Date.now(),
        isPublic: !isPrivate && !isDraft,
        isPrivate, isDraft, isScheduled, publishVideosToGallery, isSlideshowEnabled,
        releaseDate: releaseDate ? new Date(releaseDate).getTime() : undefined
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-[9px] font-black uppercase tracking-widest text-white/40">Cast (comma separated)</label>
                  <input type="text" value={movieMetadata.cast?.join(', ')} onChange={(e) => setMovieMetadata({ ...movieMetadata, cast: e.target.value.split(',').map(s => s.trim()) })} placeholder="Actor 1, Actor 2..." className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm font-bold outline-none text-white placeholder:text-white/10" />
                </div>
                <div className="space-y-2">
                  <label className="block text-[9px] font-black uppercase tracking-widest text-white/40">Crew (comma separated)</label>
                  <input type="text" value={movieMetadata.crew?.join(', ')} onChange={(e) => setMovieMetadata({ ...movieMetadata, crew: e.target.value.split(',').map(s => s.trim()) })} placeholder="Director, Producer..." className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm font-bold outline-none text-white placeholder:text-white/10" />
                </div>
              </div>
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

      {/* Audio/General Upload Drop Zone */}
      {(type !== 'VIDEO' || !['MOVIE', 'TV_SERIES'].includes(subType || '')) && (
        <div className="space-y-4">
          <div className="relative group">
            <input type="file" multiple accept={type === 'BOOK' ? '.pdf,.epub,.txt' : type === 'VIDEO' ? 'video/*' : type === 'PHOTO' ? 'image/*' : type === 'GAME' ? '*' : 'audio/*'} onChange={handleFolderSelect} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
            <div className="w-full py-16 border-2 border-dashed border-white/10 rounded-[3rem] flex flex-col items-center justify-center gap-6 group-hover:bg-white/[0.04] transition-all group-hover:border-white/20">
              <div className="p-6 rounded-[1.5rem] bg-white/5 text-white/40 group-hover:text-white transition-all shadow-2xl group-hover:scale-110 duration-500"><Upload size={32} /></div>
              <div className="text-center px-4">
                <p className="text-lg font-black uppercase tracking-widest text-white/60 mb-2">
                  {type === 'BOOK' ? 'Upload Chapters / Files' : type === 'PHOTO' ? 'Upload Photos' : type === 'GAME' ? 'Upload Game Files' : type === 'VIDEO' ? 'Upload Video' : 'Upload Audio Tracks'}
                </p>
                <p className="text-[11px] text-small-orange font-black uppercase tracking-[0.4em] opacity-60">Direct Upload to Google Cloud Storage</p>
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

      {type === 'BOOK' && bookChapters.length > 0 && (
        <div className="space-y-4 max-h-[500px] overflow-y-auto pr-4 custom-scrollbar">
          {bookChapters.map((chapter, i) => (
            <div key={chapter.id} className="flex flex-col gap-5 p-8 rounded-[2.5rem] bg-white/[0.03] border border-white/5 hover:bg-white/[0.05] transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-5 overflow-hidden flex-1">
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-[11px] font-black text-small-orange border border-white/10">{i + 1}</div>
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

  const renderStep4 = () => (
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

  const stepContent = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4];

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
            {step < 4 ? (
              <button type="button" onClick={goNext} className="flex-1 flex items-center justify-center gap-2 py-5 bg-white text-black font-black uppercase tracking-[0.3em] text-sm rounded-full hover:scale-[1.02] transition-all shadow-2xl active:scale-95">
                {step === 0 ? (type ? `Continue with ${TYPE_OPTIONS.find(t => t.id === type)?.label}` : 'Select a Type') : 'Continue'} <ChevronRight size={18} />
              </button>
            ) : (
              <button type="submit" disabled={isDeploying || !title} className="flex-1 py-5 bg-white text-black font-black uppercase tracking-[0.5em] text-sm rounded-full transition-all hover:scale-[1.02] shadow-3xl disabled:opacity-30 active:scale-95">
                {isDeploying ? (initialAlbum ? 'Updating Cloud...' : 'Deploying to Cloud...') : (initialAlbum ? 'Save Changes' : 'Publish to Global Audience')}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default AlbumCreator;
