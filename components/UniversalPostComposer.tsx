import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Image, Smile, Globe, X, Mic, Camera, Square, Share2,
  BarChart2, FlaskConical, ChevronDown, ChevronUp, Plus, Trash2,
  ToggleLeft, ToggleRight, BookOpen, List,
} from 'lucide-react';
import VoiceRecorder from './VoiceRecorder';
import { Album, IPWorld, UserProfile } from '../types';
import { useFediverse } from '../contexts/FediverseContext';
import SocialEmbedCard from './SocialEmbedCard';
import { detectSocialEmbeds, type SocialEmbed } from '../utils/socialEmbed';
import { searchUsers } from '../services/backendService';
import ContentLabelPicker from './safety/ContentLabelPicker';
import { SanctuaryGatePicker } from './sanctuary/SanctuaryGate';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ComposerAttachment {
  type: 'PHOTO' | 'VIDEO' | 'AUDIO' | 'GIF' | 'MODEL3D';
  url: string;
  title?: string;
  thumbnail?: string;   // poster for MODEL3D embeds
  file?: File;
  reused?: boolean;     // this file is already in the user's library (will be reused, not re-uploaded)
  forceNew?: boolean;   // user chose to upload a fresh copy anyway
}

export interface AssetEmbed {
  type: 'ALBUM' | 'VIDEO' | 'WORLD' | 'CHARACTER' | 'ARTICLE' | 'PLAYLIST' | 'MODULE' | 'TRACK';
  id: string;
  title: string;
  imageUrl?: string;
  subtitle?: string;
}

export interface ComposerPoll {
  question: string;
  options: string[];
  multiSelect: boolean;
  durationHours: 24 | 48 | 72 | 168; // 1d / 2d / 3d / 7d
}

export interface ComposerDataViz {
  presetId: string;
  title: string;
  source: string;
}

export interface ExclusiveConfig {
  type: 'countdown' | 'viewLimit';
  expiresAt?: number;  // absolute ms timestamp (Date.now() + chosen duration)
  viewLimit?: number;  // max unique profile views before auto-delete
}

export interface ComposerPostData {
  text: string;
  attachments: ComposerAttachment[];
  assetEmbed?: AssetEmbed;
  theme: 'STANDARD' | 'SCRAPBOOK' | 'PHOTO_ALBUM' | 'MUSIC_PLAYER' | 'NEWSPAPER' | 'ARCADE';
  poll?: ComposerPoll;
  dataViz?: ComposerDataViz;
  exclusive?: ExclusiveConfig;
  /** Creator-applied content labels (graphic / 18+ / artistic nudity / sensitive) */
  contentLabels?: import('../services/contentSafetyService').ContentLabel[];
  /** Long-form post mode: thread splits at 500 chars; booklet shows page-turn UI */
  postMode?: 'thread' | 'booklet';
  /** Pre-split chunks used when postMode === 'thread' or 'booklet' */
  threadChunks?: string[];
  /** When set, the post's media is locked behind the author's Sanctuary. */
  sanctuaryGate?: import('../types').SanctuaryGate;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const THEMES: { id: ComposerPostData['theme']; label: string }[] = [
  { id: 'STANDARD',    label: 'Standard'  },
  { id: 'SCRAPBOOK',   label: 'Scrapbook' },
  { id: 'PHOTO_ALBUM', label: 'Photo'     },
  { id: 'MUSIC_PLAYER',label: 'Music'     },
  { id: 'NEWSPAPER',   label: 'Paper'     },
];

const COMMON_EMOJIS = ['😀','😂','🥺','😍','🔥','👏','🎵','🎨','🌟','💯','🚀','❤️','🎉','👀','🤔','😎','🙏','💪','🌈','✨'];
const GIPHY_KEY = '4Sbiygh5QwzvnHYaZm2IbqW44MSBMd4K';
const DURATION_OPTIONS: { label: string; value: ComposerPoll['durationHours'] }[] = [
  { label: '24 hours', value: 24 },
  { label: '2 days',   value: 48 },
  { label: '3 days',   value: 72 },
  { label: '7 days',   value: 168 },
];
const VIZ_PRESETS: ComposerDataViz[] = [
  { presetId: 'EARTHQUAKES', title: 'Live Earthquakes',   source: 'USGS'    },
  { presetId: 'NASA_NEO',    title: 'Near-Earth Objects', source: 'NASA'    },
  { presetId: 'WEATHER',     title: 'Weather Forecast',   source: 'NOAA'    },
  { presetId: 'ARXIV',       title: 'Research Papers',    source: 'arXiv'   },
];

const COUNTDOWN_OPTIONS: { label: string; ms: number }[] = [
  { label: '15 min', ms: 15 * 60 * 1000 },
  { label: '30 min', ms: 30 * 60 * 1000 },
  { label: '1 hr',   ms: 60 * 60 * 1000 },
  { label: '2 hr',   ms: 2 * 60 * 60 * 1000 },
  { label: '4 hr',   ms: 4 * 60 * 60 * 1000 },
  { label: '6 hr',   ms: 6 * 60 * 60 * 1000 },
  { label: '12 hr',  ms: 12 * 60 * 60 * 1000 },
  { label: '24 hr',  ms: 24 * 60 * 60 * 1000 },
];
const VIEW_LIMIT_OPTIONS = [5, 10, 25, 50, 100];
const MAX_MEDIA_NOTE_SECONDS = 30;

type AssetTab = 'Albums' | 'Worlds' | 'More';
const MORE_TYPES: { label: string; type: AssetEmbed['type'] }[] = [
  { label: 'Video',     type: 'VIDEO'     },
  { label: 'Character', type: 'CHARACTER' },
  { label: 'Article',   type: 'ARTICLE'   },
  { label: 'Module',    type: 'MODULE'    },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface UniversalPostComposerProps {
  currentUser: import('firebase/auth').User | null;
  placeholder?: string;
  onPost: (data: ComposerPostData) => Promise<void>;
  onMakeStory?: (mediaUrl: string, mediaType: 'PHOTO' | 'VIDEO') => void;
  onMakeShort?: (videoUrl: string, title: string) => void;
  onSendToRello?: (videoUrl: string, title: string) => void;
  userAlbums?: Album[];
  userWorlds?: IPWorld[];
  compact?: boolean;
  avatarUrl?: string;
  /** Prefill the editable body (e.g. sharing an academic artifact). */
  initialText?: string;
  /** Prefill media (e.g. an embedded 3D scan or artifact image). */
  initialAttachments?: ComposerAttachment[];
  /** Start expanded — used when the composer opens inside a share modal. */
  autoExpand?: boolean;
  /** Destination picker (discipline vs social feed, clubs) injected by the share flow. */
  destinationSlot?: React.ReactNode;
  /** Override the primary action label (default "Post"). */
  postLabel?: string;
  /** When provided, offers a "gate this post behind your Sanctuary" control. */
  userSanctuaryId?: string;
  userSanctuaryTiers?: import('../types').SanctuaryTier[];
}

// ── Component ─────────────────────────────────────────────────────────────────

const UniversalPostComposer: React.FC<UniversalPostComposerProps> = ({
  currentUser,
  placeholder = 'Share something...',
  onPost,
  onMakeStory,
  onMakeShort,
  onSendToRello,
  userAlbums = [],
  userWorlds = [],
  compact = false,
  avatarUrl,
  initialText,
  initialAttachments,
  autoExpand = false,
  destinationSlot,
  postLabel,
  userSanctuaryId,
  userSanctuaryTiers,
}) => {
  const [expanded, setExpanded]     = useState(autoExpand);
  const [text, setText]             = useState(initialText ?? '');
  const [attachments, setAttachments] = useState<ComposerAttachment[]>(initialAttachments ?? []);
  const [assetEmbed, setAssetEmbed] = useState<AssetEmbed | undefined>(undefined);
  const [sanctuaryGate, setSanctuaryGate] = useState<import('../types').SanctuaryGate | undefined>(undefined);
  const [theme, setTheme]           = useState<ComposerPostData['theme']>('STANDARD');
  const [poll, setPoll]             = useState<ComposerPoll | null>(null);
  const [dataViz, setDataViz]       = useState<ComposerDataViz | null>(null);
  const [showEmoji, setShowEmoji]   = useState(false);
  const [showGif, setShowGif]       = useState(false);
  const [showPoll, setShowPoll]     = useState(false);
  const [showViz, setShowViz]       = useState(false);
  const [gifQuery, setGifQuery]     = useState('');
  const [gifResults, setGifResults] = useState<any[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [contentLabels, setContentLabels] = useState<import('../services/contentSafetyService').ContentLabel[]>([]);
  const [safetyBlock, setSafetyBlock] = useState<string | null>(null);
  const [assetTab, setAssetTab]     = useState<AssetTab>('Albums');
  const [moreAssetType, setMoreAssetType] = useState<AssetEmbed['type'] | null>(null);
  const [moreAssetId, setMoreAssetId]     = useState('');
  const [moreAssetTitle, setMoreAssetTitle] = useState('');
  const [posting, setPosting]       = useState(false);
  const [crossPost, setCrossPost]   = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [videoCapturing, setVideoCapturing]       = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [exclusive, setExclusive]   = useState<ExclusiveConfig | null>(null);
  const [showExclusive, setShowExclusive] = useState(false);
  const [exclusiveMode, setExclusiveMode] = useState<'countdown' | 'viewLimit'>('countdown');
  const [selectedCountdownMs, setSelectedCountdownMs] = useState(COUNTDOWN_OPTIONS[3].ms); // default 2hr
  const [selectedViewLimit, setSelectedViewLimit]     = useState(25);
  const [camSeconds, setCamSeconds] = useState(0);
  const [detectedEmbeds, setDetectedEmbeds] = useState<SocialEmbed[]>([]);
  const [postMode, setPostMode] = useState<'thread' | 'booklet'>('thread');

  const CHUNK_SIZE = 500;
  const splitIntoChunks = (str: string): string[] => {
    const chunks: string[] = [];
    let remaining = str;
    while (remaining.length > CHUNK_SIZE) {
      let cut = remaining.lastIndexOf(' ', CHUNK_SIZE);
      if (cut < CHUNK_SIZE * 0.6) cut = CHUNK_SIZE;
      chunks.push(remaining.slice(0, cut).trim());
      remaining = remaining.slice(cut).trim();
    }
    if (remaining) chunks.push(remaining);
    return chunks;
  };

  // Detect social URLs in text as user types (debounced 350ms)
  useEffect(() => {
    const t = setTimeout(() => setDetectedEmbeds(detectSocialEmbeds(text)), 350);
    return () => clearTimeout(t);
  }, [text]);

  // Auto-grow the textarea to hug its content — starts short (no giant empty
  // black box on phones) and expands as the user types, capped so it never
  // pushes the toolbar/post button off-screen (scrolls internally past the cap).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [text, expanded]);

  // ── @mention autocomplete ─────────────────────────────────────────────────
  const [mentionQuery, setMentionQuery]       = useState<string | null>(null);
  const [mentionResults, setMentionResults]   = useState<UserProfile[]>([]);
  const [mentionLoading, setMentionLoading]   = useState(false);
  const [mentionIndex, setMentionIndex]       = useState(0);
  const [mentionAnchor, setMentionAnchor]     = useState(0); // index of the triggering @
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (mentionQuery === null || mentionQuery.length === 0) {
      setMentionResults([]);
      return;
    }
    setMentionLoading(true);
    const t = setTimeout(async () => {
      const results = await searchUsers(mentionQuery);
      setMentionResults(results.slice(0, 6));
      setMentionIndex(0);
      setMentionLoading(false);
    }, 220);
    return () => clearTimeout(t);
  }, [mentionQuery]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    const cursor = e.target.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const match = before.match(/@([A-Za-z0-9_]*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionAnchor(cursor - match[0].length);
    } else {
      setMentionQuery(null);
    }
  };

  const insertMention = (user: UserProfile) => {
    const cursor = textareaRef.current?.selectionStart ?? text.length;
    const token = `@[${user.displayName}](${user.uid}) `;
    const newText = text.slice(0, mentionAnchor) + token + text.slice(cursor);
    setText(newText);
    setMentionQuery(null);
    setMentionResults([]);
    const newCursor = mentionAnchor + token.length;
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(newCursor, newCursor);
    });
  };

  const handleMentionKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery === null || mentionResults.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, mentionResults.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionResults[mentionIndex]); }
    else if (e.key === 'Escape') { setMentionQuery(null); }
  };

  const { broadcast, accounts } = useFediverse();
  const hasFediverse = accounts.length > 0;

  const fileInputRef    = useRef<HTMLInputElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const videoCamStream  = useRef<MediaStream | null>(null);
  const videoCamRecorder= useRef<MediaRecorder | null>(null);
  const videoCamChunks  = useRef<Blob[]>([]);
  const dragCounter     = useRef(0);
  const camTimerRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  const canPost = text.trim().length > 0 || attachments.length > 0 || !!assetEmbed || !!poll || !!dataViz;

  // ── File helpers ─────────────────────────────────────────────────────────────

  const processFiles = useCallback((files: FileList | File[]) => {
    Array.from(files).forEach(async file => {
      const url = URL.createObjectURL(file);
      const type: ComposerAttachment['type'] = file.type.startsWith('video/')
        ? 'VIDEO'
        : file.type.startsWith('audio/')
        ? 'AUDIO'
        : 'PHOTO';
      setAttachments(prev => [...prev, { type, url, title: file.name, file }]);
      // Is this file already in the user's library? If so, flag it so we reuse instead of
      // uploading a duplicate — the user can still choose a fresh copy per attachment.
      const uid = (currentUser as any)?.uid;
      if (uid && (type === 'PHOTO' || type === 'VIDEO')) {
        try {
          const { fingerprintFile, lookupMedia } = await import('../services/mediaDedup');
          const fp = await fingerprintFile(file);
          if (fp) {
            const hit = await lookupMedia(uid, fp);
            if (hit) setAttachments(prev => prev.map(a => a.url === url ? { ...a, reused: true } : a));
          }
        } catch { /* dedup is best-effort */ }
      }
    });
  }, [currentUser]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(e.target.files);
    e.target.value = '';
  };

  const removeAttachment = (i: number) =>
    setAttachments(prev => prev.filter((_, idx) => idx !== i));

  // ── Drag-and-drop ────────────────────────────────────────────────────────────

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
      setExpanded(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files);
  };

  // ── Emoji / GIF ──────────────────────────────────────────────────────────────

  const insertEmoji = (emoji: string) => { setText(t => t + emoji); setShowEmoji(false); };

  const searchGifs = async (q: string) => {
    if (!q.trim()) { setGifResults([]); return; }
    setGifLoading(true);
    try {
      const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=16&rating=pg`);
      setGifResults((await res.json()).data || []);
    } catch { setGifResults([]); }
    finally { setGifLoading(false); }
  };

  const addGif = (gif: any) => {
    const url = gif?.images?.fixed_height?.url || gif?.images?.original?.url || '';
    if (!url) return;
    setAttachments(prev => [...prev, { type: 'GIF', url, title: gif.title || 'GIF' }]);
    setShowGif(false); setGifQuery(''); setGifResults([]);
  };

  // ── Asset embed ──────────────────────────────────────────────────────────────

  const embedAlbum = (album: Album) => {
    setAssetEmbed({ type: 'ALBUM', id: album.id, title: album.title, imageUrl: album.coverImage, subtitle: album.artist });
    setShowAssetPicker(false);
  };
  const embedWorld = (world: IPWorld) => {
    setAssetEmbed({ type: 'WORLD', id: world.id, title: world.name, imageUrl: world.coverImage, subtitle: world.worldType });
    setShowAssetPicker(false);
  };
  const embedMoreAsset = () => {
    if (!moreAssetType || !moreAssetTitle.trim()) return;
    setAssetEmbed({ type: moreAssetType, id: moreAssetId, title: moreAssetTitle });
    setShowAssetPicker(false); setMoreAssetType(null); setMoreAssetId(''); setMoreAssetTitle('');
  };

  // ── Poll helpers ─────────────────────────────────────────────────────────────

  const initPoll = () => {
    setPoll({ question: '', options: ['', ''], multiSelect: false, durationHours: 24 });
    setShowPoll(true);
    setShowViz(false); setShowEmoji(false); setShowGif(false); setShowAssetPicker(false);
  };
  const removePoll = () => { setPoll(null); setShowPoll(false); };
  const updatePollOption = (i: number, value: string) =>
    setPoll(p => p ? { ...p, options: p.options.map((o, idx) => idx === i ? value : o) } : p);
  const addPollOption = () =>
    setPoll(p => p && p.options.length < 4 ? { ...p, options: [...p.options, ''] } : p);
  const removePollOption = (i: number) =>
    setPoll(p => p && p.options.length > 2 ? { ...p, options: p.options.filter((_, idx) => idx !== i) } : p);

  // ── DataViz helpers ──────────────────────────────────────────────────────────

  const selectViz = (preset: ComposerDataViz) => {
    setDataViz(preset);
    setShowViz(false);
    setPoll(null); setShowPoll(false);
  };

  // ── Camera ───────────────────────────────────────────────────────────────────

  const openCameraCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      videoCamStream.current = stream;
      if (videoPreviewRef.current) { videoPreviewRef.current.srcObject = stream; videoPreviewRef.current.play(); }
      setVideoCapturing(true);
    } catch { alert('Camera access denied'); }
  };
  const startCameraRecord = () => {
    if (!videoCamStream.current) return;
    videoCamChunks.current = [];
    const rec = new MediaRecorder(videoCamStream.current);
    rec.ondataavailable = e => { if (e.data.size > 0) videoCamChunks.current.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(videoCamChunks.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      setAttachments(prev => [...prev, { type: 'VIDEO', url, title: 'Video note', file: new File([blob], 'cam.webm', { type: 'video/webm' }) }]);
      setCamSeconds(0);
    };
    rec.start();
    videoCamRecorder.current = rec;
    setCamSeconds(0);
    camTimerRef.current = setInterval(() => {
      setCamSeconds(prev => {
        if (prev + 1 >= MAX_MEDIA_NOTE_SECONDS) {
          stopCameraRecord();
          return MAX_MEDIA_NOTE_SECONDS;
        }
        return prev + 1;
      });
    }, 1000);
  };
  const stopCameraRecord = () => {
    if (camTimerRef.current) { clearInterval(camTimerRef.current); camTimerRef.current = null; }
    videoCamRecorder.current?.stop();
    closeCameraCapture();
  };
  const closeCameraCapture = () => {
    if (camTimerRef.current) { clearInterval(camTimerRef.current); camTimerRef.current = null; }
    videoCamStream.current?.getTracks().forEach(t => t.stop());
    videoCamStream.current = null;
    videoCamRecorder.current = null;
    setVideoCapturing(false);
    setCamSeconds(0);
  };
  // Take a still photo from the live camera and add it as a PHOTO attachment.
  const captureCameraPhoto = () => {
    const v = videoPreviewRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth; canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      setAttachments(prev => [...prev, { type: 'PHOTO', url, title: 'Photo', file: new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' }) }]);
      closeCameraCapture();
    }, 'image/jpeg', 0.9);
  };

  // ── Post ─────────────────────────────────────────────────────────────────────

  const buildExclusiveConfig = (): ExclusiveConfig | undefined => {
    if (!exclusive) return undefined;
    if (exclusiveMode === 'countdown') {
      return { type: 'countdown', expiresAt: Date.now() + selectedCountdownMs };
    }
    return { type: 'viewLimit', viewLimit: selectedViewLimit };
  };

  const applyExclusive = () => {
    if (exclusiveMode === 'countdown') {
      setExclusive({ type: 'countdown', expiresAt: Date.now() + selectedCountdownMs });
    } else {
      setExclusive({ type: 'viewLimit', viewLimit: selectedViewLimit });
    }
    setShowExclusive(false);
  };

  const handlePost = async () => {
    if (!canPost || posting) return;
    setPosting(true);
    setSafetyBlock(null);
    try {
      // AI safety screen: blocks likely-prohibited content (porn, real gore,
      // doxxing, non-consensual likeness) and auto-adds missing content labels.
      let finalLabels = contentLabels;
      if (text.trim().length > 0) {
        try {
          const { aiScreenContent } = await import('../services/contentSafetyService');
          const screen = await aiScreenContent(text, attachments.map(a => `${a.type}${a.title ? `: ${a.title}` : ''}`));
          if (screen) {
            const hardBlock = screen.prohibited.length > 0 && screen.confidence === 'HIGH';
            if (hardBlock) {
              setSafetyBlock(`This post appears to violate Plajah's guidelines (${screen.prohibited.map(p => p.reason).join('; ')}). It can't be published. If you believe this is a mistake, adjust the content and try again.`);
              const { reportContent } = await import('../services/contentSafetyService');
              reportContent({ contentId: 'pre-publish', contentType: 'post', reason: (screen.prohibited[0].id as any) ?? 'other', details: text.slice(0, 500) }).catch(() => {});
              return;
            }
            if (screen.suggestedLabels.length) {
              finalLabels = [...new Set([...contentLabels, ...screen.suggestedLabels])];
              setContentLabels(finalLabels);
            }
          }
        } catch { /* screening unavailable — never block posting on AI downtime */ }
      }

      const pollData = poll && poll.question.trim() && poll.options.filter(o => o.trim()).length >= 2
        ? { ...poll, options: poll.options.filter(o => o.trim()) }
        : undefined;
      const isLong = text.length > CHUNK_SIZE;
      const threadChunks = isLong ? splitIntoChunks(text) : undefined;
      await onPost({ text, attachments, assetEmbed, theme, poll: pollData, dataViz: dataViz ?? undefined, exclusive: buildExclusiveConfig(), ...(finalLabels.length ? { contentLabels: finalLabels } : {}), ...(isLong ? { postMode, threadChunks } : {}), ...(sanctuaryGate ? { sanctuaryGate } : {}) });
      if (crossPost && hasFediverse && text.trim()) {
        broadcast({ text: text.trim(), thumbnail: attachments.find(a => a.type === 'PHOTO')?.url, uri: window.location.href }).catch(() => {});
      }
      setText(''); setAttachments([]); setAssetEmbed(undefined); setSanctuaryGate(undefined); setTheme('STANDARD');
      setPoll(null); setDataViz(null); setShowPoll(false); setShowViz(false);
      setExclusive(null); setShowExclusive(false); setContentLabels([]);
      setPostMode('thread');
      setExpanded(false);
    } finally { setPosting(false); }
  };

  const videoAttachments = attachments.filter(a => a.type === 'VIDEO');

  const closeAll = () => { setShowEmoji(false); setShowGif(false); setShowAssetPicker(false); setShowPoll(false); setShowViz(false); };

  // ── Collapsed ─────────────────────────────────────────────────────────────────

  if (!expanded) {
    return (
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => setExpanded(true)}
        className={`w-full rounded-3xl p-4 flex items-center gap-3 text-left transition-all cursor-pointer ${
          isDragging
            ? 'bg-orange-500/10 border-2 border-dashed border-orange-400/60 shadow-[0_0_30px_rgba(255,140,0,0.2)]'
            : 'bg-white/[0.03] border border-white/10 hover:bg-white/[0.05]'
        }`}
      >
        <img
          src={avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser?.uid || 'anon'}`}
          className="w-9 h-9 rounded-full border border-white/10 shrink-0"
          alt=""
        />
        {isDragging
          ? <span className="text-sm font-black text-orange-400 uppercase tracking-widest">Drop files to attach</span>
          : <span className="text-sm text-white/30 font-medium">{placeholder}</span>
        }
      </div>
    );
  }

  // ── Expanded ──────────────────────────────────────────────────────────────────

  return (
    <div
      className={`relative rounded-3xl p-3 sm:p-5 space-y-3 transition-all ${
        isDragging
          ? 'bg-orange-500/8 border-2 border-dashed border-orange-400/50 shadow-[0_0_40px_rgba(255,140,0,0.15)]'
          : 'bg-white/[0.03] border border-white/10'
      }`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drop overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-3xl pointer-events-none">
          <div className="text-4xl">📎</div>
          <p className="text-sm font-black uppercase tracking-widest text-orange-400">Drop to attach</p>
          <p className="text-[10px] text-white/40 uppercase tracking-widest">Photos, videos, audio</p>
        </div>
      )}

      {/* Destination picker (share flow) */}
      {destinationSlot}

      {/* Sanctuary gate (opt-in — only when the author has a sanctuary) */}
      {userSanctuaryId && (attachments.length > 0 || !!assetEmbed) && (
        <div className="pl-0 sm:pl-12">
          <SanctuaryGatePicker sanctuaryId={userSanctuaryId} tiers={userSanctuaryTiers} value={sanctuaryGate} onChange={setSanctuaryGate} />
        </div>
      )}

      {/* Avatar + textarea — avatar hidden on phone so the text box gets full width */}
      <div className={`flex items-start gap-3 ${isDragging ? 'opacity-20 pointer-events-none' : ''}`}>
        <img
          src={avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser?.uid || 'anon'}`}
          className="hidden sm:block w-9 h-9 rounded-full border border-white/10 shrink-0 mt-1"
          alt=""
        />
        <div className="flex-1 relative min-w-0">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleMentionKeyDown}
            placeholder={placeholder}
            rows={2}
            className="w-full bg-transparent text-base sm:text-sm font-medium resize-none outline-none placeholder:opacity-30 min-h-[56px] max-h-[320px] overflow-y-auto leading-relaxed"
            autoFocus
          />

          {/* @mention dropdown */}
          {mentionQuery !== null && (
            <div className="absolute top-full left-0 z-50 mt-1 w-72 bg-[#0e0e0e]/98 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
              {mentionLoading ? (
                <div className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-white/25">
                  Searching…
                </div>
              ) : mentionQuery.length === 0 ? (
                <div className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-white/25">
                  Type a name to search
                </div>
              ) : mentionResults.length === 0 ? (
                <div className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-white/25">
                  No users found for "{mentionQuery}"
                </div>
              ) : (
                mentionResults.map((user, i) => (
                  <button
                    key={user.uid}
                    onMouseDown={e => { e.preventDefault(); insertMention(user); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      i === mentionIndex ? 'bg-white/8' : 'hover:bg-white/5'
                    }`}
                  >
                    <img
                      src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`}
                      className="w-8 h-8 rounded-full object-cover border border-white/10 shrink-0"
                      alt=""
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black truncate text-white">{user.displayName}</p>
                      {user.bio && <p className="text-[8px] text-white/35 truncate mt-0.5">{user.bio}</p>}
                    </div>
                    <span className="text-[8px] font-black uppercase tracking-widest text-white/20 shrink-0">
                      {user.followerCount > 0 ? `${user.followerCount} followers` : ''}
                    </span>
                  </button>
                ))
              )}
              <div className="px-4 py-2 border-t border-white/5">
                <p className="text-[7px] font-black uppercase tracking-widest text-white/15">↑↓ navigate · Enter select · Esc dismiss</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Theme chips */}
      <div className="flex flex-wrap gap-2 pl-0 sm:pl-12">
        {THEMES.map(t => (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${
              theme === t.id ? 'bg-small-orange text-black' : 'bg-white/5 text-white/40 hover:bg-white/10'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content labels + community guidelines */}
      <div className="pl-0 sm:pl-12">
        <ContentLabelPicker selected={contentLabels} onChange={setContentLabels} />
        {safetyBlock && (
          <div className="mt-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30">
            <p className="text-[9px] font-bold text-red-300 leading-relaxed">{safetyBlock}</p>
          </div>
        )}
      </div>

      {/* Attachment preview strip */}
      {attachments.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pl-0 sm:pl-12 pb-1 scrollbar-hide">
          {attachments.map((att, i) => (
            <div key={i} className="relative shrink-0 rounded-2xl overflow-hidden border border-white/10 bg-white/5">
              {att.type === 'PHOTO' || att.type === 'GIF' ? (
                <img src={att.url} className="w-24 h-20 object-cover" alt="" loading="lazy" />
              ) : att.type === 'VIDEO' ? (
                <video src={att.url} className="w-24 h-20 object-cover" muted playsInline controls />
              ) : att.type === 'AUDIO' ? (
                <div className="w-36 h-12 flex items-center gap-2 px-3">
                  <Mic size={12} className="text-small-orange shrink-0" />
                  <audio src={att.url} controls className="w-full h-8" style={{ minWidth: 0 }} />
                </div>
              ) : att.type === 'MODEL3D' ? (
                <div className="w-28 h-20 relative bg-black/40">
                  {att.thumbnail
                    ? <img src={att.thumbnail} className="w-full h-full object-cover opacity-70" alt="" loading="lazy" />
                    : <div className="w-full h-full flex items-center justify-center text-white/30 text-lg">◈</div>}
                  <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded-md bg-black/70 text-[8px] font-black uppercase tracking-widest text-small-orange">3D Scan</span>
                </div>
              ) : (
                <div className="w-24 h-20 flex items-center justify-center text-[9px] font-black uppercase tracking-widest text-white/40 p-2 text-center">
                  {att.title || att.type}
                </div>
              )}
              <button
                onClick={() => removeAttachment(i)}
                className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center hover:bg-black transition-all"
              >
                <X size={10} />
              </button>
              {att.reused && (
                <div className="absolute bottom-0 inset-x-0 bg-black/75 backdrop-blur-sm px-1.5 py-1 flex items-center justify-between gap-1">
                  <span className="text-[7px] font-black uppercase tracking-widest text-emerald-300 leading-none" title="Already in your library — will be reused, not re-uploaded">
                    {att.forceNew ? 'New copy' : 'In library'}
                  </span>
                  <button
                    onClick={() => setAttachments(prev => prev.map((a, idx) => idx === i ? { ...a, forceNew: !a.forceNew } : a))}
                    className="text-[7px] font-black uppercase tracking-widest text-white/60 hover:text-white leading-none shrink-0"
                    title={att.forceNew ? 'Reuse the copy already in your library' : 'Upload a fresh copy instead'}
                  >
                    {att.forceNew ? 'Reuse' : 'New copy'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Video action sheet */}
      {videoAttachments.length > 0 && (
        <div className="flex gap-2 flex-wrap pl-0 sm:pl-12">
          {videoAttachments.map((att, i) => (
            <div key={i} className="flex gap-2">
              {onSendToRello && (
                <button onClick={() => onSendToRello(att.url, att.title || 'Video')}
                  className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/20 text-white/60 hover:border-white/40 hover:text-white transition-all">
                  📺 Send to Rello
                </button>
              )}
              {onMakeStory && (
                <button onClick={() => onMakeStory(att.url, 'VIDEO')}
                  className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/20 text-white/60 hover:border-white/40 hover:text-white transition-all">
                  📖 Make Story
                </button>
              )}
              {onMakeShort && (
                <button onClick={() => onMakeShort(att.url, att.title || 'Video')}
                  className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/20 text-white/60 hover:border-white/40 hover:text-white transition-all">
                  ▶ Make Short
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Social embed live preview */}
      {detectedEmbeds.length > 0 && (
        <div className="pl-0 sm:pl-12 space-y-2">
          <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/25">Embed preview</p>
          {detectedEmbeds.map((embed, i) => (
            <SocialEmbedCard key={i} embed={embed} />
          ))}
        </div>
      )}

      {/* Asset embed preview */}
      {assetEmbed && (
        <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl p-3 ml-0 sm:ml-12">
          {assetEmbed.imageUrl && <img src={assetEmbed.imageUrl} className="w-12 h-12 rounded-xl object-cover shrink-0" alt="" />}
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-black uppercase tracking-widest text-small-orange mb-0.5">{assetEmbed.type}</p>
            <p className="text-xs font-bold truncate">{assetEmbed.title}</p>
            {assetEmbed.subtitle && <p className="text-[9px] text-white/40 truncate">{assetEmbed.subtitle}</p>}
          </div>
          <button onClick={() => setAssetEmbed(undefined)} className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 shrink-0 transition-all"><X size={10} /></button>
        </div>
      )}

      {/* ── Poll builder ── */}
      {showPoll && (
        <div className="ml-0 sm:ml-12 bg-white/[0.03] border border-white/10 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/50">Poll</p>
            <button onClick={removePoll} className="p-1 rounded-full text-white/20 hover:text-red-400 hover:bg-red-400/10 transition-all"><Trash2 size={12} /></button>
          </div>

          <input
            value={poll?.question || ''}
            onChange={e => setPoll(p => p ? { ...p, question: e.target.value } : p)}
            placeholder="Ask a question…"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/30 transition-all"
          />

          {poll?.options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full border-2 border-white/20 shrink-0 flex items-center justify-center text-[8px] font-black text-white/30">{i + 1}</div>
              <input
                value={opt}
                onChange={e => updatePollOption(i, e.target.value)}
                placeholder={`Option ${i + 1}`}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-sm text-white placeholder-white/25 outline-none focus:border-white/30 transition-all"
              />
              {(poll?.options.length || 0) > 2 && (
                <button onClick={() => removePollOption(i)} className="p-1 text-white/20 hover:text-red-400 transition-all"><X size={12} /></button>
              )}
            </div>
          ))}

          {(poll?.options.length || 0) < 4 && (
            <button onClick={addPollOption} className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-colors">
              <Plus size={11} /> Add option
            </button>
          )}

          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => setPoll(p => p ? { ...p, multiSelect: !p.multiSelect } : p)}
              className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors"
            >
              {poll?.multiSelect ? <ToggleRight size={16} className="text-orange-400" /> : <ToggleLeft size={16} />}
              Multiple choice
            </button>
            <select
              value={poll?.durationHours || 24}
              onChange={e => setPoll(p => p ? { ...p, durationHours: Number(e.target.value) as ComposerPoll['durationHours'] } : p)}
              className="bg-white/5 border border-white/10 rounded-xl px-2 py-1 text-[9px] font-black text-white/50 outline-none"
            >
              {DURATION_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* ── DataViz picker ── */}
      {showViz && !dataViz && (
        <div className="ml-0 sm:ml-12 bg-white/[0.03] border border-white/10 rounded-2xl p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3">Embed Live Data</p>
          <div className="grid grid-cols-2 gap-2">
            {VIZ_PRESETS.map(preset => (
              <button
                key={preset.presetId}
                onClick={() => selectViz(preset)}
                className="flex items-center gap-2 p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 hover:border-white/20 transition-all text-left"
              >
                <FlaskConical size={14} className="text-cyan-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] font-black text-white truncate">{preset.title}</p>
                  <p className="text-[8px] text-white/30 uppercase tracking-widest">{preset.source}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* DataViz embed badge */}
      {dataViz && (
        <div className="flex items-center gap-3 bg-cyan-500/10 border border-cyan-500/20 rounded-2xl p-3 ml-0 sm:ml-12">
          <FlaskConical size={16} className="text-cyan-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-black uppercase tracking-widest text-cyan-400/70 mb-0.5">Live Data Viz</p>
            <p className="text-xs font-bold text-white truncate">{dataViz.title}</p>
            <p className="text-[8px] text-white/30 uppercase tracking-widest">{dataViz.source}</p>
          </div>
          <button onClick={() => setDataViz(null)} className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 shrink-0 transition-all"><X size={10} /></button>
        </div>
      )}

      {/* ── Exclusive post panel ── */}
      {showExclusive && (
        <div className="ml-0 sm:ml-12 rounded-2xl p-4 space-y-3" style={{ background: 'rgba(255,80,0,0.06)', border: '1px solid rgba(255,120,0,0.2)' }}>
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#ff8c00' }}>🔥 Exclusive Post</p>
            <button onClick={() => { setShowExclusive(false); setExclusive(null); }} className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all"><X size={10} /></button>
          </div>

          {/* Mode tabs */}
          <div className="flex gap-2">
            {(['countdown', 'viewLimit'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setExclusiveMode(mode)}
                className="px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all"
                style={exclusiveMode === mode
                  ? { background: 'rgba(255,140,0,0.25)', color: '#ff8c00', border: '1px solid rgba(255,140,0,0.5)' }
                  : { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.08)' }
                }
              >
                {mode === 'countdown' ? '⏱ Countdown' : '👁 View Limit'}
              </button>
            ))}
          </div>

          {exclusiveMode === 'countdown' ? (
            <div className="space-y-2">
              <p className="text-[8px] text-white/30 uppercase tracking-widest">Post disappears after</p>
              <div className="flex flex-wrap gap-1.5">
                {COUNTDOWN_OPTIONS.map(opt => (
                  <button
                    key={opt.ms}
                    onClick={() => setSelectedCountdownMs(opt.ms)}
                    className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all"
                    style={selectedCountdownMs === opt.ms
                      ? { background: 'rgba(255,120,0,0.3)', color: '#ff8c00', border: '1px solid rgba(255,140,0,0.6)' }
                      : { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.07)' }
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[8px] text-white/30 uppercase tracking-widest">Post disappears after this many unique viewers</p>
              <div className="flex flex-wrap gap-1.5">
                {VIEW_LIMIT_OPTIONS.map(n => (
                  <button
                    key={n}
                    onClick={() => setSelectedViewLimit(n)}
                    className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all"
                    style={selectedViewLimit === n
                      ? { background: 'rgba(255,120,0,0.3)', color: '#ff8c00', border: '1px solid rgba(255,140,0,0.6)' }
                      : { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.07)' }
                    }
                  >
                    {n} viewers
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={applyExclusive}
            className="px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all"
            style={{ background: 'rgba(255,100,0,0.85)', color: 'black' }}
          >
            Set Exclusive
          </button>
        </div>
      )}

      {/* Active exclusive badge */}
      {exclusive && !showExclusive && (
        <div
          className="flex items-center justify-between ml-0 sm:ml-12 rounded-2xl px-3 py-2"
          style={{ background: 'rgba(255,80,0,0.08)', border: '1px solid rgba(255,120,0,0.22)' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">🔥</span>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#ff8c00' }}>Exclusive Post</p>
              <p className="text-[8px] text-white/30">
                {exclusive.type === 'countdown'
                  ? `Self-destructs in ${COUNTDOWN_OPTIONS.find(o => o.ms === selectedCountdownMs)?.label ?? ''}`
                  : `Visible to ${exclusive.viewLimit} unique viewers`
                }
              </p>
            </div>
          </div>
          <button onClick={() => { setExclusive(null); setShowExclusive(false); }} className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all"><X size={10} /></button>
        </div>
      )}

      {/* Emoji picker */}
      {showEmoji && (
        <div className="pl-0 sm:pl-12 flex flex-wrap gap-1.5 bg-white/5 rounded-2xl p-3 border border-white/10">
          {COMMON_EMOJIS.map(emoji => (
            <button key={emoji} onClick={() => insertEmoji(emoji)} className="text-lg hover:scale-125 transition-transform">{emoji}</button>
          ))}
        </div>
      )}

      {/* GIF picker */}
      {showGif && (
        <div className="pl-0 sm:pl-12 space-y-2">
          <input
            value={gifQuery}
            onChange={e => { setGifQuery(e.target.value); searchGifs(e.target.value); }}
            placeholder="Search GIFs… (powered by GIPHY)"
            autoFocus
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none placeholder:opacity-30 focus:border-white/30 transition-all"
          />
          {gifLoading && <p className="text-[9px] text-white/30 text-center py-2 uppercase tracking-widest">Searching…</p>}
          {!gifLoading && gifQuery && gifResults.length === 0 && <p className="text-[9px] text-white/20 text-center py-2 uppercase tracking-widest">No results</p>}
          {!gifLoading && !gifQuery && <p className="text-[9px] text-white/20 text-center py-2 uppercase tracking-widest">Type to search</p>}
          {gifResults.length > 0 && (
            <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto no-scrollbar">
              {gifResults.map((gif: any) => (
                <button key={gif.id} onClick={() => addGif(gif)} className="rounded-xl overflow-hidden border border-white/10 hover:border-white/30 transition-all group aspect-square">
                  <img src={gif?.images?.fixed_height_small?.url || gif?.images?.original?.url} className="w-full h-full object-cover group-hover:scale-110 transition-transform" alt={gif.title} loading="lazy" />
                </button>
              ))}
            </div>
          )}
          <p className="text-[7px] text-white/15 text-right font-bold">Powered by GIPHY</p>
        </div>
      )}

      {/* Asset picker */}
      {showAssetPicker && (
        <div className="ml-0 sm:ml-12 bg-black/80 border border-white/10 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              {(['Albums', 'Worlds', 'More'] as AssetTab[]).map(tab => (
                <button key={tab} onClick={() => setAssetTab(tab)}
                  className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${assetTab === tab ? 'bg-white text-black' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>
                  {tab}
                </button>
              ))}
            </div>
            <button onClick={() => setShowAssetPicker(false)} className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all"><X size={10} /></button>
          </div>
          {assetTab === 'Albums' && (
            <div className="grid grid-cols-4 gap-2">
              {userAlbums.slice(0, 8).map(album => (
                <button key={album.id} onClick={() => embedAlbum(album)} className="rounded-xl overflow-hidden border border-white/10 hover:border-white/30 transition-all group">
                  <img src={album.coverImage} className="w-full aspect-square object-cover group-hover:scale-105 transition-transform" alt="" />
                  <p className="text-[8px] font-black truncate px-1 py-0.5 opacity-60">{album.title}</p>
                </button>
              ))}
              {userAlbums.length === 0 && <p className="col-span-4 text-[9px] text-white/30 text-center py-4">No albums yet</p>}
            </div>
          )}
          {assetTab === 'Worlds' && (
            <div className="grid grid-cols-3 gap-2">
              {userWorlds.slice(0, 6).map(world => (
                <button key={world.id} onClick={() => embedWorld(world)} className="rounded-xl overflow-hidden border border-white/10 hover:border-white/30 transition-all group">
                  <img src={world.coverImage} className="w-full aspect-square object-cover group-hover:scale-105 transition-transform" alt="" />
                  <p className="text-[8px] font-black truncate px-1 py-0.5 opacity-60">{world.name}</p>
                </button>
              ))}
              {userWorlds.length === 0 && <p className="col-span-3 text-[9px] text-white/30 text-center py-4">No worlds yet</p>}
            </div>
          )}
          {assetTab === 'More' && (
            <div className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                {MORE_TYPES.map(mt => (
                  <button key={mt.type} onClick={() => setMoreAssetType(moreAssetType === mt.type ? null : mt.type)}
                    className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${moreAssetType === mt.type ? 'bg-small-orange text-black border-small-orange' : 'border-white/10 text-white/40 hover:border-white/30 hover:text-white'}`}>
                    {mt.label}
                  </button>
                ))}
              </div>
              {moreAssetType && (
                <div className="space-y-2">
                  <input value={moreAssetId} onChange={e => setMoreAssetId(e.target.value)} placeholder="Asset ID (optional)" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none placeholder:opacity-30" />
                  <input value={moreAssetTitle} onChange={e => setMoreAssetTitle(e.target.value)} placeholder="Title" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none placeholder:opacity-30" />
                  <button onClick={embedMoreAsset} disabled={!moreAssetTitle.trim()} className="px-4 py-1.5 bg-white text-black rounded-xl text-[9px] font-black uppercase tracking-widest disabled:opacity-30 transition-all hover:bg-white/90">Embed</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Camera panel */}
      {videoCapturing && (
        <div className="pl-0 sm:pl-12 space-y-2">
          <div className="relative rounded-2xl overflow-hidden bg-black aspect-video max-h-40">
            <video ref={videoPreviewRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
            {videoCamRecorder.current?.state === 'recording' && (
              <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-red-600/90 px-2 py-0.5 rounded-full">
                <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                <span className="text-[8px] font-black text-white uppercase tracking-widest">
                  {camSeconds}s / {MAX_MEDIA_NOTE_SECONDS}s
                </span>
              </div>
            )}
            {videoCamRecorder.current?.state === 'recording' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-900">
                <div
                  className="h-full bg-red-500 transition-all"
                  style={{ width: `${(camSeconds / MAX_MEDIA_NOTE_SECONDS) * 100}%` }}
                />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {videoCamRecorder.current?.state !== 'recording' && (
              <button onClick={captureCameraPhoto} className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white border border-white/20 rounded-full text-[9px] font-black uppercase tracking-widest hover:bg-white/20 transition-all">
                <Camera size={12} /> Photo
              </button>
            )}
            {videoCamRecorder.current?.state !== 'recording' ? (
              <button onClick={startCameraRecord} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-full text-[9px] font-black uppercase tracking-widest hover:bg-red-500 transition-all">
                <div className="w-3 h-3 rounded-full bg-white" /> Record
              </button>
            ) : (
              <button onClick={stopCameraRecord} className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-full text-[9px] font-black uppercase tracking-widest hover:bg-white/90 transition-all">
                <Square size={11} fill="currentColor" /> Stop & Attach
              </button>
            )}
            <button onClick={closeCameraCapture} className="p-2 text-white/40 hover:text-white rounded-xl transition-all"><X size={14} /></button>
          </div>
        </div>
      )}

      {/* Voice recorder */}
      {showVoiceRecorder && (
        <div className="pl-0 sm:pl-12">
          <VoiceRecorder
            onSend={(blob) => {
              const url = URL.createObjectURL(blob);
              setAttachments(prev => [...prev, { type: 'AUDIO', url, title: 'Voice note', file: new File([blob], 'voice.webm', { type: 'audio/webm' }) }]);
              setShowVoiceRecorder(false);
            }}
            onCancel={() => setShowVoiceRecorder(false)}
          />
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-1 pl-0 sm:pl-12 flex-wrap">
        <input ref={fileInputRef} type="file" accept="image/*,video/*,audio/*" multiple className="hidden" onChange={handleFileChange} />

        <button onClick={() => fileInputRef.current?.click()} className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/8 transition-all" title="Photo / Video">
          <Image size={16} />
        </button>
        <button
          onClick={() => { setShowVoiceRecorder(s => !s); closeAll(); }}
          className={`p-2 rounded-xl transition-all ${showVoiceRecorder ? 'text-small-orange bg-white/10' : 'text-white/40 hover:text-white hover:bg-white/8'}`}
          title="Voice note"
        >
          <Mic size={16} />
        </button>
        <button
          onClick={() => { if (videoCapturing) closeCameraCapture(); else { openCameraCapture(); closeAll(); } }}
          className={`p-2 rounded-xl transition-all ${videoCapturing ? 'text-red-400 bg-red-400/15' : 'text-white/40 hover:text-white hover:bg-white/8'}`}
          title="Camera"
        >
          <Camera size={16} />
        </button>
        <button
          onClick={() => { setShowGif(s => !s); setShowEmoji(false); setShowAssetPicker(false); setShowPoll(false); setShowViz(false); }}
          className={`p-2 rounded-xl transition-all text-[10px] font-black ${showGif ? 'text-small-orange bg-white/10' : 'text-white/40 hover:text-white hover:bg-white/8'}`}
          title="GIF"
        >
          GIF
        </button>
        <button
          onClick={() => { setShowEmoji(s => !s); setShowGif(false); setShowAssetPicker(false); setShowPoll(false); setShowViz(false); }}
          className={`p-2 rounded-xl transition-all ${showEmoji ? 'text-small-orange bg-white/10' : 'text-white/40 hover:text-white hover:bg-white/8'}`}
          title="Emoji"
        >
          <Smile size={16} />
        </button>
        <button
          onClick={() => { setShowAssetPicker(s => !s); setShowEmoji(false); setShowGif(false); setShowPoll(false); setShowViz(false); }}
          className={`p-2 rounded-xl transition-all ${showAssetPicker ? 'text-small-orange bg-white/10' : 'text-white/40 hover:text-white hover:bg-white/8'}`}
          title="Embed asset"
        >
          <Globe size={16} />
        </button>

        {/* Poll button */}
        <button
          onClick={() => { if (showPoll) { removePoll(); } else { initPoll(); } }}
          className={`p-2 rounded-xl transition-all ${showPoll || poll ? 'text-purple-400 bg-purple-400/15' : 'text-white/40 hover:text-white hover:bg-white/8'}`}
          title="Add poll"
        >
          <BarChart2 size={16} />
        </button>

        {/* DataViz button */}
        <button
          onClick={() => { setShowViz(s => !s); setShowEmoji(false); setShowGif(false); setShowAssetPicker(false); setShowPoll(false); }}
          className={`p-2 rounded-xl transition-all ${showViz || dataViz ? 'text-cyan-400 bg-cyan-400/15' : 'text-white/40 hover:text-white hover:bg-white/8'}`}
          title="Embed live data visualization"
        >
          <FlaskConical size={16} />
        </button>

        {/* Exclusive post button */}
        <button
          onClick={() => { setShowExclusive(s => !s); setShowEmoji(false); setShowGif(false); setShowAssetPicker(false); setShowPoll(false); setShowViz(false); }}
          className={`p-2 rounded-xl transition-all text-base leading-none ${showExclusive || exclusive ? 'bg-orange-500/20' : 'text-white/40 hover:bg-white/8'}`}
          title="Exclusive post — self-destructs by time or view count"
          style={showExclusive || exclusive ? { filter: 'drop-shadow(0 0 6px rgba(255,140,0,0.7))' } : {}}
        >
          🔥
        </button>

        {/* Post-mode toggle — visible when text passes 500 chars */}
        {text.length > CHUNK_SIZE && (
          <div className="flex items-center gap-0.5 bg-white/5 rounded-xl p-0.5 border border-white/8">
            <button
              title="Thread mode — splits into a connected thread"
              onClick={() => setPostMode('thread')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${postMode === 'thread' ? 'bg-small-orange text-black' : 'text-white/35 hover:text-white'}`}
            >
              <List size={11} />
              Thread
            </button>
            <button
              title="Booklet mode — turns like pages every 500 characters"
              onClick={() => setPostMode('booklet')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${postMode === 'booklet' ? 'bg-purple-500 text-white' : 'text-white/35 hover:text-white'}`}
            >
              <BookOpen size={11} />
              Booklet
            </button>
          </div>
        )}

        <div className="flex-1" />

        <span className={`text-[9px] font-black tabular-nums ${text.length > CHUNK_SIZE ? 'text-small-orange' : 'text-white/20'}`}>
          {text.length > CHUNK_SIZE
            ? `${splitIntoChunks(text).length} ${postMode === 'booklet' ? 'pages' : 'parts'}`
            : `${text.length}`}
        </span>

        {hasFediverse && (
          <button
            onClick={() => setCrossPost(v => !v)}
            title={crossPost ? 'Cross-posting to Mastodon/Bluesky' : 'Cross-post to Mastodon/Bluesky'}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[9px] font-bold border transition-all ${
              crossPost ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-400' : 'border-white/10 text-white/25 hover:text-white/50'
            }`}
          >
            <Share2 size={10} />
            {crossPost ? 'Fediverse ✓' : 'Fediverse'}
          </button>
        )}

        <button
          onClick={() => { setExpanded(false); setText(''); setAttachments([]); setAssetEmbed(undefined); setPoll(null); setDataViz(null); setExclusive(null); setShowExclusive(false); setPostMode('thread'); }}
          className="p-2 rounded-xl text-white/30 hover:text-white hover:bg-white/8 transition-all"
        >
          <X size={14} />
        </button>

        <button
          onClick={handlePost}
          disabled={!canPost || posting}
          className="px-6 py-2 bg-small-orange text-black rounded-full text-[10px] font-black uppercase tracking-widest disabled:opacity-30 hover:bg-small-orange/90 transition-all"
        >
          {posting ? '...' : (postLabel || 'Post')}
        </button>
      </div>
    </div>
  );
};

export default UniversalPostComposer;
