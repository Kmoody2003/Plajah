import { thumb, onThumbError, THUMB, coverGridSrc } from '../../src/lib/imageThumb';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Download, Sparkles, Play, Pause, Copy, Check, ExternalLink,
  Film, Layers, Loader2, Music2, CheckCircle2, Share2, Megaphone,
  Send, Rocket, Image as ImageIcon, TrendingUp, ListChecks, Upload,
  Trash2, Globe, MessageCircle, Mail, Radio, RotateCcw, Code2
} from 'lucide-react';
import type { Album, PromoKit, Track, UserProfile } from '../../types';
import type { PromoFormat, PromoRecipe, PromoRelease, PromoTemplateId, PromoDsp } from '../../services/chora/promoTypes';
import { PROMO_FORMATS, PROMO_SUITES, REVIEW_PROMO_SUITES, ALL_PROMO_SUITES, DSP_NAMES } from '../../services/chora/promoTypes';
import { createPromoRecipe, promoCaption } from '../../services/chora/promoGeneratorService';
import { selectFirst15Seconds, DEFAULT_PROMO_SNIPPET_SECONDS } from '../../services/chora/audioSnippetService';
import { createPromoScene, promoSceneSvg, promoAnimatedSceneSvg, promoTelaDocument, type PromoArtwork } from '../../services/chora/promoPresets';
import {
  preparePromoArtwork, exportPromoBundle, exportPromoMotion,
  exportPromoPng, exportPromoAnimatedGif, shareableAnimatedPromoHtml,
  downloadPromo, promoFilename, resolveChoraTrackStreamUrl
} from '../../services/chora/promoExportService';
import { getTrackStream, pickStreamUrl, prefetchTrackStreams } from '../../services/choraStreamService';
import { buildShareUrl, type ShareAsset } from '../../services/deepLinkService';
import { auth, createPost, fetchProjectFromCloud, updateAlbum, uploadFile } from '../../services/backendService';
import { cleanDescription } from '../../utils/description';

export interface ChoraPromoModalProps {
  album: Album;
  currentUser?: UserProfile | { uid: string; displayName?: string | null; photoURL?: string | null } | null;
  onClose: () => void;
  onOpenTela?: (documentId: string) => void;
  onUpdateAlbum?: (updated: Album) => void;
  initialTab?: 'CARDS' | 'CAMPAIGNS' | 'ASSETS';
}

type PromoTab = 'CARDS' | 'CAMPAIGNS' | 'ASSETS';
type SlotKey = keyof Omit<PromoKit, 'updatedAt'>;

interface SlotDef {
  key: SlotKey;
  label: string;
  where: string;
  spec: string;
  accept: string;
  kind: 'video' | 'audio' | 'image';
  ratio: string;
  maxBytes: number;
}

const PROMO_KIT_SLOTS: SlotDef[] = [
  { key: 'teaserLoopUrl', label: 'Teaser Loop', where: 'Landing panorama columns · story tease', spec: '1080 × 1920 · 9:16 · MP4/WebM · ≤ 30 s', accept: 'video/*,.mp4,.m4v,.mov,.webm', kind: 'video', ratio: '9 / 16', maxBytes: 40 * 1024 * 1024 },
  { key: 'trailerUrl', label: 'Trailer', where: 'Marquee hero · Cinema page · TV apps', spec: '1920 × 1080 · 16:9 · MP4 H.264 · ≤ 90 s', accept: 'video/*,.m4v,.mp4,.mov,.webm', kind: 'video', ratio: '16 / 9', maxBytes: 120 * 1024 * 1024 },
  { key: 'audioSampleUrl', label: 'Audio Sample', where: 'Chora hover · rails · listening parties', spec: 'Chora 15s stream · 48 kHz AAC/MP3', accept: 'audio/*,.mp3,.m4a,.aac,.wav,.flac,.ogg', kind: 'audio', ratio: '5 / 2', maxBytes: 50 * 1024 * 1024 },
  { key: 'keyArtUrl', label: 'Key Art', where: 'Archive tiles · rails · search', spec: '1500 × 1500 · 1:1 · PNG/JPG', accept: 'image/*', kind: 'image', ratio: '1 / 1', maxBytes: 8 * 1024 * 1024 },
  { key: 'posterUrl', label: 'Poster', where: 'Cinema & Lorea poster surfaces', spec: '1000 × 1500 · 2:3 · PNG/JPG', accept: 'image/*', kind: 'image', ratio: '2 / 3', maxBytes: 8 * 1024 * 1024 },
  { key: 'wideBannerUrl', label: 'Wide Banner', where: 'Rail headers · profile & org headers', spec: '2560 × 720 · 32:9 · PNG/JPG', accept: 'image/*', kind: 'image', ratio: '32 / 9', maxBytes: 10 * 1024 * 1024 },
  { key: 'shareCardUrl', label: 'Share Card', where: 'Link previews (OG) · social shares', spec: '1200 × 630 · 1.91:1 · PNG/JPG', accept: 'image/*', kind: 'image', ratio: '1.91 / 1', maxBytes: 5 * 1024 * 1024 },
  { key: 'tvBillboardUrl', label: 'TV Billboard', where: 'Android TV · Fire TV · FAST channels', spec: '1920 × 1080 · 16:9 · JPG · 5% title-safe margin', accept: 'image/*', kind: 'image', ratio: '16 / 9', maxBytes: 8 * 1024 * 1024 },
];

function fmtDate(ts?: number) {
  return ts ? new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
}

function resolveShareAssetType(album: Album): ShareAsset {
  const t = String(album.type || 'MUSIC').toUpperCase();
  if (t === 'MOVIE' || t === 'TV' || t === 'SERIES') return 'movie';
  if (t === 'VIDEO' || t === 'SHORT') return 'video';
  if (t === 'BOOK' || t === 'COMIC') return 'book';
  return 'album';
}

interface BuiltPromotion {
  key: string;
  badge: string;
  label: string;
  recommendedFormat: PromoFormat;
  text: string;
}

function buildPromotionsForProject(a: Album, directUrl: string, featuredSongTitle?: string): {
  promotions: BuiltPromotion[];
  hashtags: string;
  checklist: string[];
} {
  const title = a.title || 'Untitled Project';
  const artist = a.artist || (a as any).director || (a as any).author || 'Creator';
  const genre = a.genre || 'NewRelease';
  const t = String(a.type || 'MUSIC').toUpperCase();
  const isFilm = t === 'MOVIE' || t === 'TV' || t === 'SERIES' || t === 'VIDEO';
  const isBook = t === 'BOOK' || t === 'COMIC';
  const verb = isFilm ? 'Watch' : isBook ? 'Read' : 'Stream';
  const partyLabel = isFilm ? 'Watch Party' : isBook ? 'Read-Along' : 'Listening Party';
  const unitCount = a.tracks?.length || (a as any).bookChapters?.length || (a as any).seasons?.length || 0;
  const unitWord = isFilm ? 'episodes' : isBook ? 'chapters' : 'tracks';
  const blurb = (cleanDescription(a.description) || a.linerNotes || '').trim();
  const short = blurb.length > 160 ? blurb.slice(0, 157).trim() + '…' : blurb;
  const dateStr = a.releaseDate ? fmtDate(a.releaseDate) : 'soon';
  const songLabel = featuredSongTitle && featuredSongTitle !== title ? `"${featuredSongTitle}" from "${title}"` : `"${title}"`;

  const promotions: BuiltPromotion[] = [
    {
      key: 'announce',
      badge: 'PHASE 01 · ANNOUNCE',
      label: 'Official Announcement',
      recommendedFormat: 'portrait',
      text: `📢 It's official — ${songLabel} by ${artist} is ${a.isScheduled && a.releaseDate && a.releaseDate > Date.now() ? `coming ${dateStr}` : 'officially live on Plajah Chora'}.${short ? `\n\n${short}` : ''}\n\n${unitCount > 1 ? `${unitCount} ${unitWord}. ` : ''}Save it, share it, and stream it on Chora:\n${directUrl}`,
    },
    {
      key: 'countdown',
      badge: 'PHASE 02 · TEASE',
      label: '15s Motion Teaser & Card',
      recommendedFormat: 'story',
      text: `⏳ ${songLabel} — ${artist}.\n\n${short || 'First 15-second teaser streaming now directly from Plajah Chora.'}\n\nTap the link to listen to the full song on Chora:\n${directUrl}`,
    },
    {
      key: 'releaseday',
      badge: 'PHASE 03 · LAUNCH',
      label: 'Out Now / Premiere Push',
      recommendedFormat: 'square',
      text: `🚀 ${songLabel} is OUT NOW on Plajah Chora!\n\n${short || `The project we've been building toward — experience ${artist} in full fidelity.`}\n\n▶ ${verb} it now on Chora, add it to your collection, and tell me your favorite moment:\n${directUrl}`,
    },
    {
      key: 'party',
      badge: 'PHASE 04 · LIVE EVENT',
      label: `${partyLabel} Invite`,
      recommendedFormat: 'landscape',
      text: `🎧 Join my live ${partyLabel} for ${songLabel} on Plajah Chora!\n\nWe're experiencing it together in real time with live chat & synced playback. Pull up here:\n${directUrl}`,
    },
    {
      key: 'thankyou',
      badge: 'PHASE 05 · MOMENTUM',
      label: 'Thank-You / Week 1 Momentum',
      recommendedFormat: 'square',
      text: `🙏 The love for ${songLabel} has been unreal. Thank you for showing up, sharing, and supporting independent creation.\n\nIf you haven't tapped in yet, ${verb.toLowerCase()} it on Chora here:\n${directUrl}`,
    },
  ];

  const tagBase = [genre, isFilm ? 'indiefilm' : isBook ? 'newbook' : 'newmusic', 'plajah', 'chora', 'newrelease', 'independentcreator']
    .concat(artist.split(/\s+/).join('').toLowerCase())
    .concat(title.split(/\s+/).join('').toLowerCase());
  const hashtags = tagBase.filter(Boolean).map(tag => `#${tag.replace(/[^a-z0-9]/gi, '')}`).join(' ');

  const checklist = [
    'Select your featured song on Chora (auto-selects first 15s for the motion teaser)',
    'Push the Official Announcement card to the Plajah Feed',
    'Export the 9:16 Story Card & 15s Motion Video for Reels / TikTok / Stories',
    'Fill your Promo Kit slots (Teaser Loop, Key Art, Share Card) for front-page hover panes',
    `Host a live synchronized ${partyLabel} with fans & clubs`,
    'Push the Out Now card across X, Instagram, WhatsApp & Telegram',
  ];

  return { promotions, hashtags, checklist };
}

const askAria = (prompt: string) => window.dispatchEvent(new CustomEvent('OPEN_ARIA', { detail: { prompt } }));
const navigateApp = (target: string, extra: object = {}) => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target, ...extra } }));

export const ChoraPromoModal: React.FC<ChoraPromoModalProps> = ({
  album,
  currentUser,
  onClose,
  onOpenTela,
  onUpdateAlbum,
  initialTab = 'CARDS',
}) => {
  // Pull live release data directly from Chora so promo cards always reflect Chora itself (not a stale embedded copy)
  const [liveAlbum, setLiveAlbum] = useState<Album>(album);
  const [choraStreamUrls, setChoraStreamUrls] = useState<Record<string, string>>({});
  const [loadingChoraStreams, setLoadingChoraStreams] = useState(false);

  useEffect(() => {
    setLiveAlbum(album);
  }, [album]);

  useEffect(() => {
    let cancelled = false;
    if (!album?.id) return;
    fetchProjectFromCloud(album.id)
      .then(remote => {
        if (!cancelled && remote) {
          setLiveAlbum(prev => ({
            ...prev,
            ...remote,
            tracks: remote.tracks?.length ? remote.tracks : prev.tracks,
          }));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [album?.id]);

  // Resolve Chora streaming URLs (`choraStreams/{trackId}` progressive AAC stream) for all tracks on the project
  useEffect(() => {
    let cancelled = false;
    const tracks = liveAlbum.tracks || [];
    if (!tracks.length) return;
    prefetchTrackStreams(tracks.map(t => t.id));
    setLoadingChoraStreams(true);
    Promise.all(
      tracks.map(async (t) => {
        const streamUrl = await resolveChoraTrackStreamUrl(t);
        return [t.id, streamUrl] as const;
      })
    )
      .then(entries => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const [id, url] of entries) {
          if (id && url) map[id] = url;
        }
        setChoraStreamUrls(map);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingChoraStreams(false);
      });
    return () => { cancelled = true; };
  }, [liveAlbum.tracks]);

  const assetType = useMemo(() => resolveShareAssetType(liveAlbum), [liveAlbum]);

  // Attach Chora streaming URLs (`browserCompatUrl`) onto each track so motion exports & previews always use the Chora stream
  const choraTracks: Track[] = useMemo(() => {
    return (liveAlbum.tracks || []).map(t => ({
      ...t,
      browserCompatUrl: choraStreamUrls[t.id] || t.browserCompatUrl || t.url,
    }));
  }, [liveAlbum.tracks, choraStreamUrls]);

  const release: PromoRelease = useMemo(() => ({
    id: liveAlbum.id,
    ownerId: liveAlbum.ownerId || (liveAlbum as any).artistId || currentUser?.uid || auth.currentUser?.uid || 'local',
    title: liveAlbum.title || 'Untitled',
    artist: liveAlbum.artist || (liveAlbum as any).director || (liveAlbum as any).author || currentUser?.displayName || 'Creator',
    coverImage: liveAlbum.coverImage || (liveAlbum as any).coverImageUrl || (liveAlbum as any).thumbnailUrl || '',
    releaseDate: liveAlbum.releaseDate,
    isScheduled: liveAlbum.isScheduled,
    tracks: choraTracks,
    autoPromo: (liveAlbum as any).autoPromo,
  }), [liveAlbum, choraTracks, currentUser]);

  const [activeTab, setActiveTab] = useState<PromoTab>(initialTab);
  const [recipe, setRecipe] = useState<PromoRecipe>(() => createPromoRecipe(release));
  const [suite, setSuite] = useState<PromoTemplateId>(recipe.template || 'kinetic-pulse');
  const [format, setFormat] = useState<PromoFormat>('story');
  const [showAllSuites, setShowAllSuites] = useState(false);

  const [artwork, setArtwork] = useState<PromoArtwork | undefined>(undefined);
  const [loadingArtwork, setLoadingArtwork] = useState<boolean>(false);

  const [exportingZip, setExportingZip] = useState(false);
  const [zipProgress, setZipProgress] = useState('');
  const [exportingVideo, setExportingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [exportingGif, setExportingGif] = useState(false);
  const [gifProgress, setGifProgress] = useState(0);
  const [animReplayKey, setAnimReplayKey] = useState(0);

  // Push / Publish states
  const [pushingFeed, setPushingFeed] = useState<string | null>(null); // 'active-card' | promo.key | slot.key
  const [pushedNotice, setPushedNotice] = useState<string | null>(null);
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [savedRecipeFlash, setSavedRecipeFlash] = useState(false);

  const [copiedKey, setCopiedKey] = useState<string>('');
  const [activeSnippetIdx, setActiveSnippetIdx] = useState<number>(0);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Ensure recipe has the first 15s of the primary Chora song selected when tracks finish loading from Chora
  useEffect(() => {
    if (choraTracks.length > 0 && (!recipe.snippets.length || !choraTracks.some(t => t.id === recipe.snippets[0]?.trackId))) {
      setRecipe(prev => ({
        ...prev,
        snippets: [selectFirst15Seconds(choraTracks[0])],
      }));
      setActiveSnippetIdx(0);
    }
  }, [choraTracks, recipe.snippets]);

  const currentSnippet = recipe.snippets[activeSnippetIdx] || recipe.snippets[0];
  const activeTrack = useMemo(
    () => release.tracks.find(t => t.id === currentSnippet?.trackId) || release.tracks[0],
    [release.tracks, currentSnippet?.trackId]
  );
  const activeStreamUrl = useMemo(
    () => (activeTrack ? choraStreamUrls[activeTrack.id] || activeTrack.browserCompatUrl || activeTrack.url : ''),
    [activeTrack, choraStreamUrls]
  );

  // Selecting a song automatically selects the first 15 seconds (0s–15s) of that song from Chora
  const handleSelectSongForPromo = (trackId: string) => {
    const chosen = release.tracks.find(t => t.id === trackId);
    if (!chosen) return;
    const first15 = selectFirst15Seconds(chosen);
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    }
    setRecipe(prev => {
      const nextSnippets = prev.snippets.length > 0 ? [...prev.snippets] : [first15];
      const targetIdx = Math.min(activeSnippetIdx, Math.max(0, nextSnippets.length - 1));
      nextSnippets[targetIdx] = first15;
      return { ...prev, snippets: nextSnippets };
    });
    setAnimReplayKey(k => k + 1);
  };

  // Direct Chora URL always includes `?track=<selectedTrackId>` when a song is selected so clicking it opens that song on Chora
  const directUrl = useMemo(() => {
    const query = assetType === 'album' && activeTrack?.id ? { track: activeTrack.id } : undefined;
    try {
      return buildShareUrl(assetType, release.id, query);
    } catch {
      const base = typeof window !== 'undefined'
        ? `${window.location.origin}/?type=${assetType}&id=${release.id}`
        : `https://plajah.com/?type=${assetType}&id=${release.id}`;
      return query?.track ? `${base}&track=${encodeURIComponent(query.track)}` : base;
    }
  }, [assetType, release.id, activeTrack?.id]);

  // Clicking on any link in the preview always navigates directly to the song on Chora
  const openSongOnChora = (trackOverride?: Track) => {
    const targetTrack = trackOverride || activeTrack || release.tracks[0];
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    }
    onClose();
    if (assetType === 'movie') {
      navigateApp('MOVIE_UX', { movie: liveAlbum });
    } else if (assetType === 'video') {
      navigateApp('VIDEO_PLAYER', { video: liveAlbum });
    } else if (assetType === 'book') {
      navigateApp('BOOK_READER', { book: liveAlbum });
    } else {
      navigateApp('PLAYER', {
        album: liveAlbum,
        albumId: release.id,
        track: targetTrack,
        trackId: targetTrack?.id,
      });
    }
  };

  // Built promotions & checklist
  const built = useMemo(
    () => buildPromotionsForProject(liveAlbum, directUrl, activeTrack?.title),
    [liveAlbum, directUrl, activeTrack?.title]
  );
  const [customPromoText, setCustomPromoText] = useState<string>(() => promoCaption(createPromoRecipe(release), directUrl));
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());

  // Promo Kit 8-slot state
  const [kit, setKit] = useState<PromoKit>(liveAlbum.promoKit || {});
  const [uploadingSlot, setUploadingSlot] = useState<Partial<Record<SlotKey, number>>>({});
  const [slotErrors, setSlotErrors] = useState<Partial<Record<SlotKey, string>>>({});
  const [kitSavedFlash, setKitSavedFlash] = useState(false);
  const [autoFillingKit, setAutoFillingKit] = useState(false);

  // Sync customPromoText when tagline/title/artist or selected song link changes
  useEffect(() => {
    setCustomPromoText(`${promoCaption(recipe, directUrl)}\n\n${built.hashtags}`);
  }, [recipe, directUrl, built.hashtags]);

  // Load and prepare raster artwork for SVG/Canvas rendering
  useEffect(() => {
    let cancel = false;
    const ac = new AbortController();
    if (release.coverImage) {
      setLoadingArtwork(true);
      preparePromoArtwork(release.coverImage, ac.signal)
        .then(res => { if (!cancel) setArtwork(res); })
        .catch(() => { /* fallback to direct URL */ })
        .finally(() => { if (!cancel) setLoadingArtwork(false); });
    }
    return () => { cancel = true; ac.abort(); };
  }, [release.coverImage]);

  // Active Promo Scene + Animated SVG (kinetic animate-on typography, breathing cover art, pulsing Chora equalizer, stationary scannable QR code)
  const activeScene = useMemo(() => {
    try {
      return createPromoScene(release, recipe, suite, format, directUrl, artwork);
    } catch {
      return null;
    }
  }, [release, recipe, suite, format, directUrl, artwork]);

  const activeSvg = useMemo(() => {
    return activeScene ? promoAnimatedSceneSvg(activeScene) : '';
  }, [activeScene]);

  // All 4 format scenes (animated) for the quick card strip & Built Promotions previews
  const allFormatScenes = useMemo(() => {
    const out: Partial<Record<PromoFormat, { svg: string; label: string; ratio: string }>> = {};
    (Object.keys(PROMO_FORMATS) as PromoFormat[]).forEach(fmt => {
      try {
        const sc = createPromoScene(release, recipe, suite, fmt, directUrl, artwork);
        out[fmt] = {
          svg: promoAnimatedSceneSvg(sc),
          label: PROMO_FORMATS[fmt].label,
          ratio: PROMO_FORMATS[fmt].ratio,
        };
      } catch {
        // skip
      }
    });
    return out;
  }, [release, recipe, suite, directUrl, artwork]);

  const togglePlayAudio = () => {
    if (!audioRef.current || !activeStreamUrl) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current.currentTime = currentSnippet?.start || 0;
      audioRef.current.play()
        .then(() => setIsPlayingAudio(true))
        .catch(() => setIsPlayingAudio(false));
    }
  };

  // Stop audio preview automatically at the end of the 15-second teaser window
  const handleAudioTimeUpdate = () => {
    if (!audioRef.current || !isPlayingAudio) return;
    const startSec = currentSnippet?.start || 0;
    const durSec = currentSnippet?.duration || DEFAULT_PROMO_SNIPPET_SECONDS;
    if (audioRef.current.currentTime >= startSec + durSec) {
      audioRef.current.pause();
      audioRef.current.currentTime = startSec;
      setIsPlayingAudio(false);
    }
  };

  const flashNotice = (msg: string) => {
    setPushedNotice(msg);
    setTimeout(() => setPushedNotice(prev => (prev === msg ? null : prev)), 3500);
  };

  const copyText = (key: string, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(prev => (prev === key ? '' : prev)), 2000);
  };

  // Save current PromoRecipe to the Album document
  const handleSaveRecipe = async () => {
    if (savingRecipe || !release.id) return;
    setSavingRecipe(true);
    try {
      const nextRecipe: PromoRecipe = { ...recipe, template: suite, updatedAt: Date.now() };
      setRecipe(nextRecipe);
      await updateAlbum(release.id, { autoPromo: nextRecipe } as any);
      onUpdateAlbum?.({ ...liveAlbum, autoPromo: nextRecipe } as any);
      setSavedRecipeFlash(true);
      setTimeout(() => setSavedRecipeFlash(false), 2200);
      flashNotice('Saved promo design recipe to project!');
    } catch {
      flashNotice('Could not save recipe — check connection.');
    } finally {
      setSavingRecipe(false);
    }
  };

  // Push any promo card + caption directly to the Plajah Feed using an Animated GIF (with animate-on text, cover art, equalizer & QR code) + direct Chora link in body
  const handlePushToPlajahFeed = async (opts?: {
    targetFormat?: PromoFormat;
    captionText?: string;
    sourceKey?: string;
    customMediaUrl?: string;
    customMediaKind?: 'image' | 'video' | 'audio';
  }) => {
    const key = opts?.sourceKey || 'active-card';
    if (pushingFeed) return;
    setPushingFeed(key);
    try {
      const fmt = opts?.targetFormat || format;
      const rawText = (opts?.captionText || customPromoText || promoCaption(recipe, directUrl)).trim();
      const text = rawText.includes(directUrl) ? rawText : `${rawText}\n\n${directUrl}`;
      let imageUrl = opts?.customMediaUrl || '';

      // Render the selected auto-promo card as a looping Animated GIF (with QR code & animate-on typography) so feed posts feel alive everywhere
      if (!imageUrl) {
        const sceneToRender = createPromoScene(release, recipe, suite, fmt, directUrl, artwork);
        try {
          const gifBlob = await exportPromoAnimatedGif(sceneToRender, { maxLongEdge: 720, frames: 20, fps: 10 });
          const gifFile = new File(
            [gifBlob],
            `${promoFilename(recipe.title)}-${suite}-${fmt}.gif`,
            { type: 'image/gif' }
          );
          imageUrl = await uploadFile(
            `albums/${release.id}/promo/feed_${suite}_${fmt}_${Date.now()}.gif`,
            gifFile
          );
        } catch {
          try {
            const pngBlob = await exportPromoPng(sceneToRender);
            const pngFile = new File(
              [pngBlob],
              `${promoFilename(recipe.title)}-${suite}-${fmt}.png`,
              { type: 'image/png' }
            );
            imageUrl = await uploadFile(
              `albums/${release.id}/promo/feed_${suite}_${fmt}_${Date.now()}.png`,
              pngFile
            );
          } catch {
            imageUrl = release.coverImage;
          }
        }
      }

      const mediaKind = opts?.customMediaKind || 'image';
      const mediaPayload = imageUrl
        ? [{
            type: mediaKind === 'video' ? 'VIDEO' : mediaKind === 'audio' ? 'AUDIO' : 'IMAGE',
            url: imageUrl,
            id: `${release.id}-${suite}-${fmt}`,
            title: activeTrack?.title ? `${activeTrack.title} · ${recipe.title}` : recipe.title,
            thumbnail: release.coverImage || imageUrl,
          } as any]
        : undefined;

      // Reference Chora directly rather than embedding a full album copy
      const choraAssetReference = {
        type: (assetType === 'movie' ? 'MOVIE' : assetType === 'video' ? 'VIDEO' : assetType === 'book' ? 'BOOK' : activeTrack ? 'TRACK' : 'ALBUM') as any,
        id: release.id,
        trackId: activeTrack?.id,
        title: activeTrack ? `${activeTrack.title} — ${release.title}` : release.title,
        subtitle: `${release.artist} · Stream on Chora`,
        image: release.coverImage || imageUrl,
        url: directUrl,
      };

      await createPost({
        text,
        imageUrl: mediaKind === 'image' ? imageUrl : undefined,
        videoUrl: mediaKind === 'video' ? imageUrl : undefined,
        media: mediaPayload,
        assetEmbed: choraAssetReference,
      } as any);

      flashNotice('Pushed animated GIF promo card + Chora link to the Plajah Feed!');
    } catch (e: any) {
      alert(`Could not push to Plajah feed: ${e?.message || 'Please make sure you are signed in.'}`);
    } finally {
      setPushingFeed(null);
    }
  };

  // Universal Native / Desktop Share with Animated GIF (animate-on text + QR code) + Direct Chora Link in the message body!
  const handleNativeShareCard = async (opts?: { targetFormat?: PromoFormat; captionText?: string }) => {
    const fmt = opts?.targetFormat || format;
    const rawText = (opts?.captionText || customPromoText || promoCaption(recipe, directUrl)).trim();
    const textWithLink = rawText.includes(directUrl) ? rawText : `${rawText}\n\n${directUrl}`;
    try {
      const sceneToRender = createPromoScene(release, recipe, suite, fmt, directUrl, artwork);
      const gifBlob = await exportPromoAnimatedGif(sceneToRender, { maxLongEdge: 720, frames: 20, fps: 10 });
      const fileName = `${promoFilename(recipe.title)}-${suite}-${fmt}.gif`;
      const file = new File([gifBlob], fileName, { type: 'image/gif' });

      if (navigator.share) {
        const shareData: ShareData = {
          title: `${recipe.title} — ${recipe.artist}`,
          text: textWithLink,
          url: directUrl,
        };
        if (navigator.canShare && navigator.canShare({ ...shareData, files: [file] })) {
          await navigator.share({ ...shareData, files: [file] });
          flashNotice('Shared animated GIF promo card with QR code & Chora link!');
          return;
        }
        await navigator.share(shareData);
        flashNotice('Shared promotion & Chora link!');
        return;
      }
      // Desktop fallback if navigator.share is unavailable: download the Animated GIF and copy caption + link
      downloadPromo(gifBlob, fileName);
      navigator.clipboard?.writeText(textWithLink).catch(() => {});
      flashNotice('Downloaded Animated GIF (with QR code) & copied Chora link caption!');
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        navigator.clipboard?.writeText(textWithLink).catch(() => {});
        flashNotice('Copied promotion & Chora link to clipboard!');
      }
    }
  };

  // Social platform direct push helpers
  const pushToSocial = (platform: 'x' | 'whatsapp' | 'facebook' | 'telegram' | 'instagram' | 'tiktok' | 'threads' | 'email', textOverride?: string) => {
    const body = (textOverride || customPromoText || promoCaption(recipe, directUrl)).trim();
    const cleanBody = body.replace(directUrl, '').trim();
    navigator.clipboard?.writeText(`${cleanBody}\n\n${directUrl}`).catch(() => {});

    switch (platform) {
      case 'x':
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(cleanBody)}&url=${encodeURIComponent(directUrl)}`, '_blank', 'noopener,noreferrer');
        break;
      case 'whatsapp':
        window.open(`https://wa.me/?text=${encodeURIComponent(`${cleanBody}\n\n${directUrl}`)}`, '_blank', 'noopener,noreferrer');
        break;
      case 'facebook':
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(directUrl)}&quote=${encodeURIComponent(cleanBody)}`, '_blank', 'noopener,noreferrer');
        break;
      case 'telegram':
        window.open(`https://t.me/share/url?url=${encodeURIComponent(directUrl)}&text=${encodeURIComponent(cleanBody)}`, '_blank', 'noopener,noreferrer');
        break;
      case 'instagram':
        flashNotice('Caption + Chora link copied! Opening Instagram…');
        window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
        break;
      case 'tiktok':
        flashNotice('Caption + Chora link copied! Opening TikTok…');
        window.open('https://www.tiktok.com/', '_blank', 'noopener,noreferrer');
        break;
      case 'threads':
        window.open(`https://www.threads.net/intent/post?text=${encodeURIComponent(`${cleanBody}\n\n${directUrl}`)}`, '_blank', 'noopener,noreferrer');
        break;
      case 'email':
        window.location.href = `mailto:?subject=${encodeURIComponent(`${recipe.title} — ${recipe.artist}`)}&body=${encodeURIComponent(`${cleanBody}\n\n${directUrl}`)}`;
        break;
    }
  };

  // Export Universal Looping Animated GIF (with animate-on typography, cover art motion, equalizer, and crisp QR code)
  const handleExportAnimatedGif = async (targetFormat?: PromoFormat) => {
    if (exportingGif) return;
    const fmt = targetFormat || format;
    setExportingGif(true);
    setGifProgress(0);
    try {
      const sc = fmt === format && activeScene
        ? activeScene
        : createPromoScene(release, recipe, suite, fmt, directUrl, artwork);
      const gifBlob = await exportPromoAnimatedGif(sc, {
        maxLongEdge: 720,
        frames: 24,
        fps: 12,
        onProgress: p => setGifProgress(Math.round(p * 100)),
      });
      const fileName = `${promoFilename(recipe.title)}-${suite}-${fmt}.gif`;
      downloadPromo(gifBlob, fileName);
      navigator.clipboard?.writeText(`${customPromoText.includes(directUrl) ? customPromoText : `${customPromoText}\n\n${directUrl}`}`).catch(() => {});
      flashNotice(`Exported Animated GIF (${PROMO_FORMATS[fmt].label}) + copied Chora link!`);
    } catch (e: any) {
      alert(`Animated GIF export failed: ${e?.message || 'Could not encode GIF.'}`);
    } finally {
      setExportingGif(false);
      setGifProgress(0);
    }
  };

  // Export Standalone Interactive Animated HTML Promo Card (with animated SVG, QR code, 15s Chora stream preview & direct Chora link)
  const handleExportAnimatedHtml = () => {
    if (!activeScene) return;
    try {
      const html = shareableAnimatedPromoHtml(activeScene, release, recipe, directUrl, activeStreamUrl);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      downloadPromo(blob, `${promoFilename(recipe.title)}-${suite}-${format}-animated.html`);
      flashNotice('Downloaded interactive Animated HTML promo card!');
    } catch (e: any) {
      alert(`Could not export Animated HTML: ${e?.message}`);
    }
  };

  // Export Full Promo Bundle (ZIP)
  const handleExportZip = async () => {
    if (exportingZip) return;
    setExportingZip(true);
    setZipProgress('Initializing assets…');
    const ac = new AbortController();
    try {
      const art = artwork || (release.coverImage ? await preparePromoArtwork(release.coverImage, ac.signal) : { url: '', width: 500, height: 500 });
      const bundleBlob = await exportPromoBundle(release, recipe, directUrl, art, (label) => {
        setZipProgress(label);
      }, ac.signal);
      downloadPromo(bundleBlob, `${promoFilename(recipe.title)}-chora-promo-pack.zip`);
      flashNotice('Downloaded Promo Pack ZIP (PNGs, Animated GIF, Interactive HTML & SVGs)!');
    } catch (e: any) {
      alert(`Export failed: ${e?.message || 'Could not package bundle.'}`);
    } finally {
      setExportingZip(false);
      setZipProgress('');
    }
  };

  // Export 15s MP4 Motion Video
  const handleExportVideo = async () => {
    if (!activeScene || exportingVideo) return;
    setExportingVideo(true);
    setVideoProgress(0);
    try {
      const { blob, extension } = await exportPromoMotion(activeScene, release, recipe, {
        seconds: 15,
        onProgress: (p) => setVideoProgress(Math.round(p * 100)),
      });
      downloadPromo(blob, `${promoFilename(recipe.title)}-${suite}-${format}-15s.${extension}`);
      flashNotice('Exported 15s motion video bumper!');
    } catch (e: any) {
      alert(`Video export failed: ${e?.message || 'Unable to record video.'}`);
    } finally {
      setExportingVideo(false);
      setVideoProgress(0);
    }
  };

  // Edit in Tela Canvas
  const handleOpenTela = () => {
    try {
      const scenes = (['story', 'square', 'portrait', 'landscape'] as PromoFormat[]).map(f =>
        createPromoScene(release, recipe, suite, f, directUrl, artwork)
      );
      const docId = `promo-${release.id}-${Date.now()}`;
      const telaDoc = promoTelaDocument(release, scenes, docId);
      localStorage.setItem(`tela_doc_${docId}`, JSON.stringify(telaDoc));
      if (onOpenTela) {
        onOpenTela(docId);
      } else {
        window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'TELA', documentId: docId } }));
      }
      onClose();
    } catch (e: any) {
      alert(`Could not launch Tela Canvas: ${e?.message}`);
    }
  };

  const handleDspToggle = (dsp: PromoDsp) => {
    setRecipe(prev => {
      const current = prev.secondaryDsps[dsp];
      const nextDsps = { ...prev.secondaryDsps };
      if (current) {
        delete nextDsps[dsp];
      } else {
        nextDsps[dsp] = `https://music.example.com/${dsp.toLowerCase().replace(/\s+/g, '')}`;
      }
      return { ...prev, secondaryDsps: nextDsps };
    });
  };

  // ── PromoKit 8-slot persistence & upload handlers ──
  const persistPromoKit = async (next: PromoKit) => {
    const stamped: PromoKit = { ...next, updatedAt: Date.now() };
    setKit(stamped);
    await updateAlbum(album.id, { promoKit: stamped });
    onUpdateAlbum?.({ ...album, promoKit: stamped });
    setKitSavedFlash(true);
    window.setTimeout(() => setKitSavedFlash(false), 2000);
  };

  const handleSlotFileUpload = async (slot: SlotDef, file: File) => {
    setSlotErrors(e => ({ ...e, [slot.key]: undefined }));
    if (file.size > slot.maxBytes) {
      setSlotErrors(e => ({ ...e, [slot.key]: `Too large — keep it under ${Math.round(slot.maxBytes / 1024 / 1024)} MB.` }));
      return;
    }
    setUploadingSlot(u => ({ ...u, [slot.key]: 0 }));
    try {
      const url = await uploadFile(
        `albums/${album.id}/promo/${slot.key}_${Date.now()}_${file.name}`,
        file,
        (p: number) => setUploadingSlot(u => ({ ...u, [slot.key]: p })),
      );
      await persistPromoKit({ ...kit, [slot.key]: url });
      flashNotice(`Uploaded ${slot.label} to Project Promo Kit!`);
    } catch {
      setSlotErrors(e => ({ ...e, [slot.key]: 'Upload failed — try again.' }));
    } finally {
      setUploadingSlot(u => { const n = { ...u }; delete n[slot.key]; return n; });
    }
  };

  const clearSlot = (slot: SlotDef) => persistPromoKit({ ...kit, [slot.key]: '' });

  // One-click: Generate & save Key Art (1:1), Poster (4:5), Share Card (16:9), and TV Billboard (16:9) from the active Auto-Promo Suite into the project's PromoKit!
  const handleAutoFillPromoKitFromSuite = async () => {
    if (autoFillingKit) return;
    setAutoFillingKit(true);
    try {
      const mapping: Array<{ fmt: PromoFormat; keys: SlotKey[] }> = [
        { fmt: 'square', keys: ['keyArtUrl'] },
        { fmt: 'portrait', keys: ['posterUrl'] },
        { fmt: 'landscape', keys: ['shareCardUrl', 'tvBillboardUrl'] },
      ];
      const nextKit: PromoKit = { ...kit };
      for (const item of mapping) {
        const sc = createPromoScene(release, recipe, suite, item.fmt, directUrl, artwork);
        const blob = await exportPromoPng(sc);
        const file = new File([blob], `${promoFilename(recipe.title)}-${suite}-${item.fmt}.png`, { type: 'image/png' });
        const url = await uploadFile(`albums/${album.id}/promo/autofill_${suite}_${item.fmt}_${Date.now()}.png`, file);
        for (const k of item.keys) {
          nextKit[k] = url;
        }
      }
      await persistPromoKit(nextKit);
      flashNotice('Auto-filled Key Art, Poster, Share Card & TV Billboard from your active suite!');
    } catch (e: any) {
      alert(`Could not auto-fill Promo Kit slots: ${e?.message || 'Check connection.'}`);
    } finally {
      setAutoFillingKit(false);
    }
  };

  const filledSlotsCount = useMemo(() => PROMO_KIT_SLOTS.filter(s => Boolean(kit[s.key])).length, [kit]);
  const checklistProgress = Math.round((checkedItems.size / built.checklist.length) * 100);
  const visibleSuites = showAllSuites ? ALL_PROMO_SUITES : PROMO_SUITES;

  const modalContent = (
    <div
      className="fixed inset-0 z-[350] flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 bg-black/85 backdrop-blur-2xl animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-6xl h-[94dvh] sm:h-auto sm:max-h-[92vh] flex flex-col bg-[#0c0814] border-t sm:border border-white/15 rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-[0_24px_90px_rgba(0,0,0,0.9)] text-white"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Top Header + Navigation Tabs ── */}
        <div className="flex flex-col gap-3 px-4 sm:px-6 py-3.5 sm:py-4 border-b border-white/10 bg-[#100B17]/95 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#6b0099] via-[#d40055] to-[#ff8c00] p-0.5 shadow-lg flex-shrink-0">
                {release.coverImage ? (
                  <img
                    src={thumb(coverGridSrc(album) || release.coverImage, THUMB.card)}
                    onError={onThumbError(release.coverImage)}
                    decoding="async"
                    loading="lazy"
                    alt={release.title}
                    className="w-full h-full object-cover rounded-[10px]"
                  />
                ) : (
                  <div className="w-full h-full bg-[#100B17] rounded-[10px] flex items-center justify-center text-white/40">
                    <Megaphone size={18} />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[#ff8c00] font-bold flex items-center gap-1">
                    <Sparkles size={11} /> PROJECT PROMOTE STUDIO
                  </span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-white/60">
                    AUTO-PROMO V{recipe.version}.0
                  </span>
                </div>
                <h2 className="text-sm sm:text-lg font-black text-white font-['Outfit'] truncate">
                  {recipe.title} <span className="text-white/40 font-normal">· {recipe.artist}</span>
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleSaveRecipe}
                disabled={savingRecipe}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/80 hover:text-white transition-all"
                title="Save this promo recipe to your project"
              >
                {savingRecipe ? <Loader2 size={12} className="animate-spin" /> : savedRecipeFlash ? <Check size={12} className="text-emerald-400" /> : <Sparkles size={12} className="text-[#ff8c00]" />}
                {savedRecipeFlash ? 'Saved' : 'Save Recipe'}
              </button>
              <button
                onClick={onClose}
                aria-label="Close Promote Studio"
                className="p-2 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* ── Mode Tabs (Responsive on Mobile & Desktop) ── */}
          <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar pt-0.5">
            <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-white/[0.04] border border-white/10">
              <button
                onClick={() => setActiveTab('CARDS')}
                className={`px-3 sm:px-4 py-1.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap transition-all ${
                  activeTab === 'CARDS'
                    ? 'bg-gradient-to-r from-[#d40055] to-[#ff8c00] text-white shadow-md'
                    : 'text-white/55 hover:text-white hover:bg-white/5'
                }`}
              >
                <Sparkles size={13} />
                <span>Auto-Promo Cards</span>
                <span className="px-1.5 py-0.2 rounded-full bg-black/30 text-[9px] font-mono">4 Formats</span>
              </button>

              <button
                onClick={() => setActiveTab('CAMPAIGNS')}
                className={`px-3 sm:px-4 py-1.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap transition-all ${
                  activeTab === 'CAMPAIGNS'
                    ? 'bg-gradient-to-r from-[#d40055] to-[#ff8c00] text-white shadow-md'
                    : 'text-white/55 hover:text-white hover:bg-white/5'
                }`}
              >
                <Megaphone size={13} />
                <span>Built Promotions</span>
                <span className="px-1.5 py-0.2 rounded-full bg-black/30 text-[9px] font-mono">{built.promotions.length}</span>
              </button>

              <button
                onClick={() => setActiveTab('ASSETS')}
                className={`px-3 sm:px-4 py-1.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap transition-all ${
                  activeTab === 'ASSETS'
                    ? 'bg-gradient-to-r from-[#d40055] to-[#ff8c00] text-white shadow-md'
                    : 'text-white/55 hover:text-white hover:bg-white/5'
                }`}
              >
                <Layers size={13} />
                <span>Promo Kit Assets</span>
                <span className="px-1.5 py-0.2 rounded-full bg-black/30 text-[9px] font-mono">{filledSlotsCount}/{PROMO_KIT_SLOTS.length}</span>
              </button>
            </div>

            {pushedNotice && (
              <div className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 shrink-0 animate-fade-in">
                <CheckCircle2 size={13} className="text-emerald-400" />
                <span>{pushedNotice}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── TAB 1: AUTO-PROMO CARDS & STUDIO ── */}
        {activeTab === 'CARDS' && (
          <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-white/10">
            {/* LEFT COLUMN: Stage Preview + All-4-Cards Strip + Push Out Bar (Cols 7) */}
            <div className="lg:col-span-7 p-4 sm:p-6 flex flex-col items-center justify-between bg-black/60 relative gap-4">
              {/* Format Selector Pills + Replay Motion Button */}
              <div className="w-full flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1 p-1 bg-white/5 border border-white/10 rounded-xl text-[11px] font-mono overflow-x-auto no-scrollbar max-w-full">
                  {(Object.keys(PROMO_FORMATS) as PromoFormat[]).map(fmt => (
                    <button
                      key={fmt}
                      onClick={() => {
                        setFormat(fmt);
                        setAnimReplayKey(k => k + 1);
                      }}
                      className={`px-2.5 sm:px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition-all ${
                        format === fmt
                          ? 'bg-[#d40055] text-white shadow-md'
                          : 'text-white/60 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {PROMO_FORMATS[fmt].label} ({PROMO_FORMATS[fmt].ratio})
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAnimReplayKey(k => k + 1)}
                    className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-mono font-bold text-[#ff8c00] flex items-center gap-1 transition-all"
                    title="Replay the kinetic animate-on entrance"
                  >
                    <RotateCcw size={11} />
                    <span>Replay Motion</span>
                  </button>
                  <span className="text-white/40 font-mono text-[10px] hidden sm:inline">
                    {PROMO_FORMATS[format].width} × {PROMO_FORMATS[format].height} · Live Motion + QR
                  </span>
                </div>
              </div>

              {/* Main Animated SVG Vector Render Frame */}
              <div className="w-full flex-1 flex flex-col items-center justify-center p-1 sm:p-2 min-h-[290px] sm:min-h-[360px] gap-2.5">
                {activeSvg ? (
                  <div
                    key={`${format}-${suite}-${animReplayKey}`}
                    className="max-h-[360px] sm:max-h-[440px] w-auto flex items-center justify-center rounded-2xl overflow-hidden shadow-2xl border border-white/15 transition-transform duration-300"
                    style={{
                      aspectRatio: format === 'story' ? '9/16' : format === 'square' ? '1/1' : format === 'portrait' ? '4/5' : '16/9',
                      maxWidth: format === 'story' ? '260px' : format === 'landscape' ? '520px' : '360px'
                    }}
                    dangerouslySetInnerHTML={{ __html: activeSvg }}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-white/30 text-xs font-mono">
                    <Loader2 size={24} className="animate-spin text-[#d40055]" />
                    {loadingArtwork ? 'Preparing High-Res Artwork…' : 'Generating Vector Stage…'}
                  </div>
                )}

                {/* Clickable Chora Song Link Preview Bar — clicking always takes you to the song on Chora */}
                <button
                  type="button"
                  onClick={() => openSongOnChora()}
                  className="w-full max-w-xl px-3.5 py-2 rounded-xl bg-[#140d21] hover:bg-[#1d1330] border border-[#ff8c00]/35 flex items-center justify-between gap-2 text-left transition-all group shadow-md"
                  title="Click to open and play this song directly on Plajah Chora"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-6 h-6 rounded-lg bg-[#ff8c00]/20 text-[#ff8c00] flex items-center justify-center shrink-0">
                      <Radio size={13} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[9px] font-mono uppercase tracking-widest text-[#ff8c00] font-bold flex items-center gap-1.5">
                        <span>LIVE FROM PLAJAH CHORA</span>
                        {activeTrack && (
                          <span className="text-emerald-400">· { activeTrack.title } (0s–{Math.round(currentSnippet?.duration || 15)}s teaser)</span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-white/85 group-hover:text-white underline decoration-[#ff8c00]/60 truncate">
                        {directUrl}
                      </div>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-[#ff8c00]/20 text-[#ff8c00] text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0 group-hover:bg-[#ff8c00] group-hover:text-black transition-all">
                    Open on Chora <ExternalLink size={11} />
                  </span>
                </button>
              </div>

              {/* All 4 Built Auto-Promo Format Cards Strip */}
              <div className="w-full space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-white/45">
                  <span>All Built Auto-Promo Cards ({ALL_PROMO_SUITES.find(s => s.id === suite)?.name})</span>
                  <span>Animated motion + scannable QR code</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {(Object.keys(PROMO_FORMATS) as PromoFormat[]).map(fmt => {
                    const cardItem = allFormatScenes[fmt];
                    const isSelected = format === fmt;
                    return (
                      <div
                        key={fmt}
                        onClick={() => {
                          setFormat(fmt);
                          setAnimReplayKey(k => k + 1);
                        }}
                        className={`group cursor-pointer rounded-xl p-1.5 border transition-all flex flex-col items-center gap-1.5 ${
                          isSelected
                            ? 'bg-[#d40055]/15 border-[#d40055] shadow-lg'
                            : 'bg-white/[0.03] border-white/10 hover:border-white/25'
                        }`}
                      >
                        <div className="w-full h-20 flex items-center justify-center overflow-hidden rounded-lg bg-black/50">
                          {cardItem?.svg ? (
                            <div
                              className="max-h-full max-w-full overflow-hidden rounded pointer-events-none"
                              style={{
                                aspectRatio: fmt === 'story' ? '9/16' : fmt === 'square' ? '1/1' : fmt === 'portrait' ? '4/5' : '16/9',
                                height: '100%',
                              }}
                              dangerouslySetInnerHTML={{ __html: cardItem.svg }}
                            />
                          ) : null}
                        </div>
                        <div className="w-full flex items-center justify-between px-1">
                          <span className="text-[9px] font-black uppercase tracking-wider text-white/80 truncate">
                            {PROMO_FORMATS[fmt].label}
                          </span>
                          <span className="text-[8px] font-mono text-white/40">{PROMO_FORMATS[fmt].ratio}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Primary Push-Out & Export Bar ── */}
              <div className="w-full pt-3 border-t border-white/10 space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    onClick={() => handlePushToPlajahFeed({ targetFormat: format, sourceKey: 'active-card' })}
                    disabled={!!pushingFeed}
                    className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#d40055] via-[#6b0099] to-[#ff8c00] hover:opacity-95 text-white font-['Outfit'] font-black text-xs uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                  >
                    {pushingFeed === 'active-card' ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Encoding GIF &amp; Pushing…
                      </>
                    ) : (
                      <>
                        <Send size={14} />
                        Push Animated GIF + Link to Feed
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => handleNativeShareCard({ targetFormat: format })}
                    className="py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-['Outfit'] font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
                  >
                    <Share2 size={14} className="text-[#ff8c00]" />
                    Share Animated GIF + Link + QR
                  </button>
                </div>

                {/* Quick Social Channels Strip + Asset Downloads */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[9px] font-mono uppercase tracking-widest text-white/40 mr-1">Push to:</span>
                    {([
                      { id: 'x', label: 'X' },
                      { id: 'instagram', label: 'IG' },
                      { id: 'tiktok', label: 'TikTok' },
                      { id: 'whatsapp', label: 'WhatsApp' },
                      { id: 'facebook', label: 'FB' },
                      { id: 'telegram', label: 'Telegram' },
                      { id: 'threads', label: 'Threads' },
                    ] as const).map(ch => (
                      <button
                        key={ch.id}
                        onClick={() => pushToSocial(ch.id)}
                        className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.15] border border-white/10 text-[10px] font-bold text-white/80 hover:text-white transition-all"
                        title={`Push to ${ch.label}`}
                      >
                        {ch.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={() => handleExportAnimatedGif(format)}
                      disabled={exportingGif}
                      className="px-3 py-1.5 rounded-xl bg-[#ff8c00]/20 hover:bg-[#ff8c00]/30 border border-[#ff8c00]/40 text-[#ff8c00] font-['Outfit'] font-bold text-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
                      title="Download universal looping Animated GIF with animate-on text & scannable QR code"
                    >
                      {exportingGif ? (
                        <>
                          <Loader2 size={12} className="animate-spin text-[#ff8c00]" />
                          GIF {gifProgress}%
                        </>
                      ) : (
                        <>
                          <Sparkles size={12} className="text-[#ff8c00]" />
                          Animated GIF
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleExportAnimatedHtml}
                      className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-['Outfit'] font-bold text-xs flex items-center gap-1.5 transition-all"
                      title="Download standalone interactive Animated HTML card with clickable Chora link & QR code"
                    >
                      <Code2 size={12} className="text-emerald-400" />
                      Animated HTML
                    </button>

                    {release.tracks.length > 0 && (
                      <button
                        onClick={handleExportVideo}
                        disabled={exportingVideo}
                        className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-['Outfit'] font-bold text-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
                      >
                        {exportingVideo ? (
                          <>
                            <Loader2 size={12} className="animate-spin text-[#00daf3]" />
                            {videoProgress}%
                          </>
                        ) : (
                          <>
                            <Film size={12} className="text-[#00daf3]" />
                            15s Video
                          </>
                        )}
                      </button>
                    )}

                    <button
                      onClick={async () => {
                        if (!activeScene) return;
                        try {
                          const pngBlob = await exportPromoPng(activeScene);
                          downloadPromo(pngBlob, `${promoFilename(recipe.title)}-${suite}-${format}.png`);
                          flashNotice(`Downloaded ${PROMO_FORMATS[format].label} PNG!`);
                        } catch (e: any) {
                          alert('Could not render PNG: ' + e?.message);
                        }
                      }}
                      className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-['Outfit'] font-bold text-xs flex items-center gap-1.5 transition-all"
                    >
                      <Download size={12} />
                      PNG
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Suite Controls, Tagline, Snippets, DSPs & Bundle Actions (Cols 5) */}
            <div className="lg:col-span-5 p-4 sm:p-6 flex flex-col justify-between space-y-5 bg-[#0e0a16]">
              <div className="space-y-5">
                {/* 1. Design Suite Selector */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-mono text-white/50 uppercase tracking-widest block font-bold">
                      1. Art Council Aesthetic Suite ({visibleSuites.length})
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowAllSuites(s => !s)}
                      className="text-[10px] font-mono text-[#ff8c00] hover:underline font-bold"
                    >
                      {showAllSuites ? 'Show Core 3' : `Show All ${ALL_PROMO_SUITES.length} Suites`}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-2 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                    {visibleSuites.map(s => {
                      const active = suite === s.id;
                      return (
                        <button
                          key={s.id}
                          onClick={() => {
                            setSuite(s.id);
                            setRecipe(prev => ({ ...prev, template: s.id }));
                            setAnimReplayKey(k => k + 1);
                          }}
                          className={`w-full text-left p-3 rounded-2xl border transition-all flex items-center justify-between ${
                            active
                              ? 'bg-white/10 border-white/30 shadow-lg'
                              : 'bg-black/30 border-white/5 hover:border-white/15'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span
                              className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: s.color }}
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-black text-white font-['Outfit'] flex items-center gap-2 flex-wrap">
                                <span>{s.number} · {s.name}</span>
                                <span className="text-[10px] text-white/40 font-normal italic font-sans">{s.subtitle}</span>
                              </div>
                              <p className="text-[11px] text-white/50 mt-0.5 truncate">{s.description}</p>
                            </div>
                          </div>
                          {active && <CheckCircle2 size={16} className="text-emerald-400 shrink-0 ml-2" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Campaign Headline / Tagline Editor */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-white/50 uppercase tracking-widest block font-bold">
                    2. Card Tagline &amp; Hook Copy
                  </label>
                  <input
                    type="text"
                    value={recipe.tagline}
                    onChange={e => setRecipe(prev => ({ ...prev, tagline: e.target.value }))}
                    placeholder="A new release. A world of its own."
                    className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#ff8c00]/60"
                  />
                </div>

                {/* 3. Chora Song Selector (Auto-Selects First 15s Stream for Motion Teaser) */}
                {release.tracks.length > 0 && (
                  <div className="space-y-2.5 p-3 rounded-2xl bg-black/40 border border-white/10">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <label className="text-[10px] font-mono text-white/60 uppercase tracking-widest font-bold block">
                          3. Select Song from Chora (First 15s Motion Teaser)
                        </label>
                        <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1 mt-0.5">
                          <CheckCircle2 size={10} />
                          {loadingChoraStreams
                            ? 'Resolving Chora stream…'
                            : `Chora stream ready · Auto-selected 0s–${Math.round(currentSnippet?.duration || 15)}s`}
                        </span>
                      </div>

                      {activeStreamUrl && (
                        <button
                          type="button"
                          onClick={togglePlayAudio}
                          className="px-2.5 py-1 rounded-lg bg-[#ff8c00]/20 hover:bg-[#ff8c00]/30 border border-[#ff8c00]/40 flex items-center gap-1 text-[10px] font-mono font-bold text-[#ff8c00]"
                        >
                          {isPlayingAudio ? <Pause size={10} /> : <Play size={10} />}
                          {isPlayingAudio ? 'Pause 15s Teaser' : 'Preview 15s Stream'}
                        </button>
                      )}
                    </div>

                    {activeStreamUrl && (
                      <audio
                        ref={audioRef}
                        src={activeStreamUrl}
                        onTimeUpdate={handleAudioTimeUpdate}
                        onEnded={() => setIsPlayingAudio(false)}
                      />
                    )}

                    {/* Chora Song Dropdown Selector */}
                    <div className="flex items-center gap-2">
                      <select
                        value={activeTrack?.id || release.tracks[0]?.id || ''}
                        onChange={e => handleSelectSongForPromo(e.target.value)}
                        aria-label="Select song from Chora for promo"
                        className="flex-1 px-3 py-2 rounded-xl bg-[#100B17] border border-white/15 text-xs font-bold text-white focus:outline-none focus:border-[#ff8c00]"
                      >
                        {release.tracks.map((trk, idx) => (
                          <option key={trk.id} value={trk.id}>
                            {idx + 1}. {trk.title} (0s – {Math.min(15, Math.round(trk.duration || 15))}s Chora Stream)
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => openSongOnChora(activeTrack)}
                        className="px-2.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-[10px] font-bold text-white flex items-center gap-1 shrink-0"
                        title="Open this song directly on Chora"
                      >
                        <ExternalLink size={11} className="text-[#ff8c00]" />
                        Chora
                      </button>
                    </div>

                    {/* Quick Track Pills (First 15s auto-selected on click) */}
                    {release.tracks.length > 1 && (
                      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
                        {release.tracks.map((trk, idx) => {
                          const isSelected = activeTrack?.id === trk.id;
                          return (
                            <button
                              key={trk.id}
                              type="button"
                              onClick={() => handleSelectSongForPromo(trk.id)}
                              className={`px-2.5 py-1.5 rounded-xl border text-left transition-all shrink-0 ${
                                isSelected
                                  ? 'bg-[#d40055]/20 border-[#d40055] text-white'
                                  : 'bg-black/30 border-white/10 text-white/60 hover:text-white'
                              }`}
                            >
                              <div className="text-[8px] font-mono uppercase text-[#ff8c00] font-bold">
                                TRACK {idx + 1} · 0s–{Math.min(15, Math.round(trk.duration || 15))}s
                              </div>
                              <div className="text-[10px] font-bold truncate max-w-[120px]">{trk.title}</div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* 4. Secondary Streaming DSP Footnote Checklist */}
                <div className="space-y-2">
                  <label className="text-[10px] font-mono text-white/50 uppercase tracking-widest block font-bold">
                    {release.tracks.length > 0 ? '4.' : '3.'} Secondary Platforms (Fine Print)
                  </label>

                  <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                    {DSP_NAMES.map(name => {
                      const checked = !!recipe.secondaryDsps[name];
                      return (
                        <button
                          key={name}
                          onClick={() => handleDspToggle(name)}
                          className={`px-2 py-1.5 rounded-lg border text-left transition-all flex items-center justify-between ${
                            checked
                              ? 'bg-white/10 border-white/30 text-white font-semibold'
                              : 'bg-black/20 border-white/5 text-white/40 hover:text-white/70'
                          }`}
                        >
                          <span className="truncate">{name}</span>
                          {checked && <Check size={11} className="text-emerald-400 shrink-0 ml-1" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 5. Bundle & Studio Action Buttons */}
              <div className="pt-4 border-t border-white/10 space-y-2">
                <button
                  onClick={handleExportZip}
                  disabled={exportingZip}
                  className="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-['Outfit'] font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {exportingZip ? (
                    <>
                      <Loader2 size={15} className="animate-spin text-white" />
                      {zipProgress || 'Packaging Promo Bundle…'}
                    </>
                  ) : (
                    <>
                      <Download size={15} className="text-[#ff8c00]" />
                      Download Complete Promo Pack (ZIP · 12 Cards)
                    </>
                  )}
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleOpenTela}
                    className="py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-white border border-white/10 text-xs font-bold font-['Outfit'] flex items-center justify-center gap-1.5 transition-all"
                  >
                    <Layers size={13} className="text-[#00daf3]" />
                    Edit in Tela Canvas
                  </button>

                  <button
                    onClick={() => copyText('caption', customPromoText)}
                    className="py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-white border border-white/10 text-xs font-bold font-['Outfit'] flex items-center justify-center gap-1.5 transition-all"
                  >
                    {copiedKey === 'caption' ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                    {copiedKey === 'caption' ? 'Caption Copied!' : 'Copy Caption'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: BUILT PROMOTIONS & CAMPAIGN COPY ── */}
        {activeTab === 'CAMPAIGNS' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-[#0b0712]">
            {/* Top Quick Launchers (Paid Boost, Billboard Ad, Analytics, Ask Aria) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <button
                onClick={() => { onClose(); navigateApp('AD_PACKAGES'); }}
                className="p-3.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 text-left transition-all"
              >
                <span className="w-8 h-8 rounded-xl bg-[#FF8C00]/20 text-[#FF8C00] flex items-center justify-center mb-2">
                  <Rocket size={16} />
                </span>
                <p className="text-xs font-black text-white uppercase tracking-wider">Boost / Paid Ad</p>
                <p className="text-[10px] text-white/40 mt-0.5">Push across Plajah rails</p>
              </button>

              <button
                onClick={() => { onClose(); navigateApp('AD_CREATOR', { promotedAssetId: release.id }); }}
                className="p-3.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 text-left transition-all"
              >
                <span className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-300 flex items-center justify-center mb-2">
                  <ImageIcon size={16} />
                </span>
                <p className="text-xs font-black text-white uppercase tracking-wider">Billboard Creator</p>
                <p className="text-[10px] text-white/40 mt-0.5">Build hero marquee ad</p>
              </button>

              <button
                onClick={() => { onClose(); navigateApp('ANALYTICS', { albumId: release.id }); }}
                className="p-3.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 text-left transition-all"
              >
                <span className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-2">
                  <TrendingUp size={16} />
                </span>
                <p className="text-xs font-black text-white uppercase tracking-wider">Release Analytics</p>
                <p className="text-[10px] text-white/40 mt-0.5">Track conversions &amp; plays</p>
              </button>

              <button
                onClick={() => askAria(`Act as my marketing strategist. My project "${release.title}" by ${release.artist} (${liveAlbum.genre || liveAlbum.type || 'release'}) is live at ${directUrl}. Description: "${cleanDescription(liveAlbum.description) || liveAlbum.linerNotes || 'n/a'}". Write me a 2-week rollout plan with punchy posts for Plajah Feed, IG Reels, TikTok, and X.`)}
                className="p-3.5 rounded-2xl bg-gradient-to-br from-[#d40055]/15 to-[#ff8c00]/15 hover:from-[#d40055]/25 hover:to-[#ff8c00]/25 border border-[#ff8c00]/30 text-left transition-all"
              >
                <span className="w-8 h-8 rounded-xl bg-[#ff8c00]/20 text-[#ff8c00] flex items-center justify-center mb-2">
                  <Sparkles size={16} />
                </span>
                <p className="text-xs font-black text-white uppercase tracking-wider">Expand with Aria</p>
                <p className="text-[10px] text-white/50 mt-0.5">AI 2-week campaign plan</p>
              </button>
            </div>

            {/* Built Promotion Cards List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-2">
                    <Megaphone size={14} className="text-[#ff8c00]" />
                    Built Promotions — Ready to Push Out
                  </h3>
                  <p className="text-[11px] text-white/45 mt-0.5">
                    Each promotion pulls live from Chora and links directly to {activeTrack ? `"${activeTrack.title}"` : `"${release.title}"`} on Chora. Click any link in the preview to open the song on Chora.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {built.promotions.map(promo => {
                  const previewCard = allFormatScenes[promo.recommendedFormat];
                  const fullCopy = `${promo.text}\n\n${built.hashtags}`;
                  const isPushing = pushingFeed === promo.key;
                  const bodyWithoutLink = promo.text.replace(directUrl, '').trim();
                  return (
                    <div
                      key={promo.key}
                      className="rounded-2xl bg-white/[0.03] border border-white/10 p-4 flex flex-col justify-between gap-3.5 hover:border-white/20 transition-all"
                    >
                      <div className="flex items-start gap-3.5">
                        {/* Mini Visual Card Preview */}
                        {previewCard?.svg && (
                          <div
                            onClick={() => { setFormat(promo.recommendedFormat); setActiveTab('CARDS'); }}
                            title="Click to customize card in Studio"
                            className="w-16 h-20 rounded-xl bg-black/60 border border-white/10 flex items-center justify-center overflow-hidden shrink-0 cursor-pointer hover:border-[#ff8c00]"
                          >
                            <div
                              className="max-h-full max-w-full overflow-hidden pointer-events-none"
                              style={{
                                aspectRatio: promo.recommendedFormat === 'story' ? '9/16' : promo.recommendedFormat === 'square' ? '1/1' : promo.recommendedFormat === 'portrait' ? '4/5' : '16/9',
                                height: '100%',
                              }}
                              dangerouslySetInnerHTML={{ __html: previewCard.svg }}
                            />
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[9px] font-mono uppercase tracking-widest text-[#ff8c00] font-bold">
                              {promo.badge}
                            </span>
                            <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-white/5 text-white/50">
                              {PROMO_FORMATS[promo.recommendedFormat].label} ({PROMO_FORMATS[promo.recommendedFormat].ratio})
                            </span>
                          </div>
                          <h4 className="text-sm font-black text-white mt-0.5">{promo.label}</h4>
                          <p className="text-[11px] text-white/70 whitespace-pre-line leading-relaxed mt-2 line-clamp-3">
                            {bodyWithoutLink}
                          </p>
                          <button
                            type="button"
                            onClick={() => openSongOnChora()}
                            className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-mono text-[#ff8c00] hover:text-[#ffaa33] underline break-all text-left"
                            title="Open song on Chora"
                          >
                            <span>{directUrl}</span>
                            <ExternalLink size={10} className="shrink-0" />
                          </button>
                        </div>
                      </div>

                      {/* Push Action Bar for this Built Promotion */}
                      <div className="pt-2.5 border-t border-white/10 flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            onClick={() => handlePushToPlajahFeed({
                              targetFormat: promo.recommendedFormat,
                              captionText: fullCopy,
                              sourceKey: promo.key,
                            })}
                            disabled={!!pushingFeed}
                            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#d40055] to-[#ff8c00] hover:opacity-95 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md transition-all disabled:opacity-50"
                          >
                            {isPushing ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                            {isPushing ? 'Pushing…' : 'Push to Feed'}
                          </button>

                          <button
                            onClick={() => handleNativeShareCard({
                              targetFormat: promo.recommendedFormat,
                              captionText: fullCopy,
                            })}
                            className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all"
                          >
                            <Share2 size={11} /> Share GIF + Link
                          </button>

                          <button
                            onClick={() => handleExportAnimatedGif(promo.recommendedFormat)}
                            disabled={exportingGif}
                            className="px-2.5 py-1.5 rounded-xl bg-[#ff8c00]/15 hover:bg-[#ff8c00]/25 border border-[#ff8c00]/35 text-[#ff8c00] text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all disabled:opacity-50"
                            title="Download Animated GIF with QR code for this promotion"
                          >
                            <Sparkles size={11} /> GIF
                          </button>

                          <button
                            onClick={() => pushToSocial('x', fullCopy)}
                            className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-[10px] font-bold transition-all"
                            title="Push to X / Twitter"
                          >
                            X
                          </button>

                          <button
                            onClick={() => pushToSocial('whatsapp', fullCopy)}
                            className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-[10px] font-bold transition-all"
                            title="Push to WhatsApp"
                          >
                            WhatsApp
                          </button>
                        </div>

                        <button
                          onClick={() => copyText(promo.key, fullCopy)}
                          className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-[10px] font-bold flex items-center gap-1 transition-all"
                        >
                          {copiedKey === promo.key ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                          {copiedKey === promo.key ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Hashtags + Release Rollout Checklist */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Campaign Hashtags &amp; Direct Chora Song Link</span>
                  <button
                    onClick={() => copyText('hashtags', `${directUrl}\n\n${built.hashtags}`)}
                    className="text-[10px] font-black uppercase tracking-widest text-[#ff8c00] flex items-center gap-1"
                  >
                    {copiedKey === 'hashtags' ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                    {copiedKey === 'hashtags' ? 'Copied' : 'Copy All'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => openSongOnChora()}
                  className="w-full text-left text-xs font-mono text-[#ff8c00] hover:text-[#ffaa33] underline break-all bg-black/40 p-2.5 rounded-xl border border-white/5 flex items-center justify-between gap-2"
                  title="Click to open this song on Plajah Chora"
                >
                  <span>{directUrl}</span>
                  <ExternalLink size={12} className="shrink-0" />
                </button>
                <p className="text-[11px] text-white/50 leading-relaxed break-words">
                  {built.hashtags}
                </p>
              </div>

              <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/50 flex items-center gap-1.5">
                    <ListChecks size={13} className="text-[#ff8c00]" /> Rollout Checklist
                  </span>
                  <span className="text-[10px] font-mono text-white/60">{checklistProgress}%</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#d40055] to-[#ff8c00] rounded-full transition-all" style={{ width: `${checklistProgress}%` }} />
                </div>
                <div className="space-y-1.5 pt-1">
                  {built.checklist.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCheckedItems(prev => {
                        const n = new Set(prev);
                        if (n.has(idx)) n.delete(idx); else n.add(idx);
                        return n;
                      })}
                      className="w-full flex items-center gap-2.5 text-left py-1"
                    >
                      <span className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${checkedItems.has(idx) ? 'bg-[#ff8c00] border-[#ff8c00]' : 'border-white/20'}`}>
                        {checkedItems.has(idx) && <Check size={11} className="text-black" />}
                      </span>
                      <span className={`text-[11px] ${checkedItems.has(idx) ? 'text-white/35 line-through' : 'text-white/75'}`}>{item}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 3: PROMO KIT ASSETS (8 NAMED SLOTS) ── */}
        {activeTab === 'ASSETS' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-[#0b0712]">
            {/* Top Banner: Auto-Fill Promo Kit from Auto-Promo Studio */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-[#d40055]/20 via-[#6b0099]/20 to-[#ff8c00]/20 border border-[#d40055]/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[#ff8c00] font-black">
                    PROJECT PROMO KIT · {filledSlotsCount}/{PROMO_KIT_SLOTS.length} SLOTS FILLED
                  </span>
                  {kitSavedFlash && (
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 flex items-center gap-1">
                      <Check size={11} /> Saved
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-black text-white mt-0.5">
                  Platform Showcase &amp; Omnichannel Promo Assets
                </h3>
                <p className="text-[11px] text-white/55 mt-0.5">
                  Hover panes on the landing page play down the chain: <strong className="text-white/85">Teaser Loop → Trailer → Audio Sample over Key Art → Cover Art</strong>. You can pull your song's Chora stream directly, auto-fill image slots from your Auto-Promo card suite, or push any asset straight to the feed.
                </p>
              </div>

              <button
                onClick={handleAutoFillPromoKitFromSuite}
                disabled={autoFillingKit}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#d40055] to-[#ff8c00] hover:opacity-95 text-white text-xs font-black uppercase tracking-wider shadow-lg flex items-center gap-2 shrink-0 transition-all disabled:opacity-50"
              >
                {autoFillingKit ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {autoFillingKit ? 'Generating & Uploading…' : 'Auto-Fill Image Slots from Suite'}
              </button>
            </div>

            {/* 8 PromoKit Slots Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {PROMO_KIT_SLOTS.map(slot => {
                const url = kit[slot.key];
                const progress = uploadingSlot[slot.key];
                const err = slotErrors[slot.key];
                const isPushingSlot = pushingFeed === slot.key;

                return (
                  <div key={slot.key} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex flex-col justify-between gap-3">
                    <div className="flex items-start gap-3.5">
                      <div
                        className="h-10 rounded-lg shrink-0 border border-white/15"
                        style={{
                          aspectRatio: slot.ratio,
                          background: url ? 'linear-gradient(135deg,#06D6A0,#00DAF3)' : 'linear-gradient(135deg,#6B0099,#D40055)',
                          opacity: url ? 0.95 : 0.45,
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-black uppercase tracking-widest text-white">{slot.label}</p>
                          {url && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[8px] font-black uppercase tracking-widest">
                              Ready
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-white/45 truncate">{slot.where}</p>
                        <p className="text-[9px] font-mono text-white/30 mt-0.5">{slot.spec}</p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {progress !== undefined ? (
                          <span className="text-[10px] font-black uppercase tracking-widest text-white/60 flex items-center gap-1.5">
                            <Loader2 size={13} className="animate-spin" /> {Math.round(progress)}%
                          </span>
                        ) : (
                          <>
                            <label className="cursor-pointer px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-colors flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white">
                              <Upload size={11} /> {url ? 'Replace' : 'Upload'}
                              <input
                                type="file"
                                accept={slot.accept}
                                className="hidden"
                                onChange={e => {
                                  const f = e.target.files?.[0];
                                  if (f) handleSlotFileUpload(slot, f);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                            {url && (
                              <button
                                type="button"
                                onClick={() => clearSlot(slot)}
                                className="p-1.5 rounded-xl bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors"
                                aria-label={`Remove ${slot.label}`}
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Direct Chora Song Stream Picker for Audio Sample (No file upload or size limit!) */}
                    {slot.key === 'audioSampleUrl' && release.tracks.length > 0 && (
                      <div className="p-2.5 rounded-xl bg-black/40 border border-[#ff8c00]/25 space-y-1.5">
                        <div className="text-[9px] font-mono uppercase tracking-widest text-[#ff8c00] font-bold flex items-center gap-1">
                          <Music2 size={11} /> Pull Streaming Song Directly from Chora (First 15s)
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {release.tracks.map((trk, idx) => {
                            const streamUrl = choraStreamUrls[trk.id] || trk.browserCompatUrl || trk.url;
                            const isCurrent = !!streamUrl && url === streamUrl;
                            return (
                              <button
                                key={trk.id}
                                type="button"
                                onClick={async () => {
                                  setSlotErrors(e => ({ ...e, audioSampleUrl: undefined }));
                                  const resolved = choraStreamUrls[trk.id] || await resolveChoraTrackStreamUrl(trk);
                                  if (!resolved) {
                                    setSlotErrors(e => ({ ...e, audioSampleUrl: 'Could not resolve Chora stream for this track.' }));
                                    return;
                                  }
                                  handleSelectSongForPromo(trk.id);
                                  await persistPromoKit({ ...kit, audioSampleUrl: resolved });
                                  flashNotice(`Linked "${trk.title}" (first 15s Chora stream) as Audio Sample!`);
                                }}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                                  isCurrent
                                    ? 'bg-[#ff8c00] text-black border-[#ff8c00]'
                                    : 'bg-white/5 hover:bg-white/15 text-white/80 border-white/10'
                                }`}
                              >
                                {idx + 1}. {trk.title} (0s–15s)
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {err && <p className="text-[10px] font-bold text-red-400">{err}</p>}

                    {url && (
                      <div className="space-y-2.5 pt-2 border-t border-white/10">
                        <div className="rounded-xl overflow-hidden bg-black/50 border border-white/10 flex items-center justify-center p-1.5">
                          {slot.kind === 'image' && <img src={url} alt={slot.label} className="max-h-32 rounded-lg object-contain" />}
                          {slot.kind === 'video' && <video src={url} controls muted playsInline className="max-h-36 rounded-lg" />}
                          {slot.kind === 'audio' && <audio src={url} controls className="w-full" />}
                        </div>

                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handlePushToPlajahFeed({
                                customMediaUrl: url,
                                customMediaKind: slot.kind,
                                captionText: `🔥 ${release.title} — ${release.artist} (${slot.label})\n\n${directUrl}`,
                                sourceKey: slot.key,
                              })}
                              disabled={!!pushingFeed}
                              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#d40055] to-[#ff8c00] text-white text-[9px] font-black uppercase tracking-wider flex items-center gap-1 transition-all disabled:opacity-50"
                            >
                              {isPushingSlot ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                              Push to Feed
                            </button>

                            <button
                              type="button"
                              onClick={() => copyText(slot.key, url)}
                              className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-[9px] font-bold flex items-center gap-1 transition-all"
                            >
                              {copiedKey === slot.key ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                              {copiedKey === slot.key ? 'Copied URL' : 'Copy Asset URL'}
                            </button>
                          </div>

                          <a
                            href={url}
                            download
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-[9px] font-bold flex items-center gap-1 transition-all"
                          >
                            <Download size={11} /> Download
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};
export default ChoraPromoModal;
