// components/elevate/RelloChurchViewer.tsx
// Top Ministry TV Channel & Live Stream Carousel + Inline Rello Church Viewer Mode
// with Auto-Mounting Lectio Mini-Bible (synced to Ambo Production Team on Live Streams
// or Playhead Timecode + Speech Detection on Replays) and Timestamped Stream Notes.

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Hls from 'hls.js';
import {
  Radio,
  Tv,
  Play,
  Pause,
  BookOpen,
  Mic,
  Sparkles,
  Clock,
  Plus,
  Volume2,
  VolumeX,
  Maximize2,
  CheckCircle2,
  Navigation,
  MessageSquarePlus,
  ChevronRight,
} from 'lucide-react';
import type { Organization } from '../../types';
import {
  useOrgLive,
  useOrgChannels,
  useLiveHubTvPlusSources,
  onAirItems,
  type OnAirItem,
  type OnAirPlayback,
} from '../../services/orgMedia';
import { hlsTuning, capLevelsToPanel } from '../../services/hlsTuning';
import { isDemoOrg } from '../../services/elevateTruth';
import {
  listenToSession,
  resolveCue,
  sessionIdFor,
  type ScriptureSession,
} from '../../services/kairosService';
import {
  getAutoScriptureState,
  subscribeAutoScripture,
  getScriptureReading,
  subscribeScriptureReading,
} from '../../services/ambo/autoScripture';
import { getParallel, DEFAULT_TRANSLATION } from '../../services/scriptureText';
import { formatRef, refId, type ScriptureRef } from '../../services/scriptureRef';
import { recordServiceNote, verseKeyOf, formatTC } from '../../services/serviceNotes';
import { verseNotes } from '../../services/readerNotes';
import { TRANSLATIONS, type BibleVerse } from '../../services/bibleService';

export interface ChurchStreamItem {
  id: string;
  title: string;
  ministryChannelName: string;
  speaker: string;
  kind: 'LIVE_SANCTUARY' | 'MINISTRY_TV_CHANNEL' | 'SERVICE_REPLAY';
  viewerCount?: number;
  badgeText: string;
  videoUrl?: string;
  playback?: OnAirPlayback;
  isOrgOwned?: boolean;
  channelNumber?: number;
  onAirItem?: OnAirItem;
  thumbnailGradient: string;
  durationSec: number;
  initialPlayheadSec: number;
  scriptureCues: Array<{
    programTC: number;
    label: string;
    ref: ScriptureRef;
    sourceLabel: 'AMBO_PRODUCTION_CUE' | 'SPEECH_ASR_DETECTED';
    spokenExcerpt: string;
  }>;
}

const ytId = (u: string) =>
  (u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|live\/)|youtu\.be\/)([\w-]{11})/) || [])[1];
const twitchChannel = (u: string) => (u.match(/twitch\.tv\/([\w]+)/) || [])[1];
const vimeoId = (u: string) => (u.match(/vimeo\.com\/(?:video\/)?(\d+)/) || [])[1];

const buildEmbedSrc = (u: string, muted: boolean, startSec = 0): string | null => {
  const y = ytId(u);
  if (y) {
    return `https://www.youtube.com/embed/${y}?autoplay=1&mute=${muted ? 1 : 0}&playsinline=1&controls=1&modestbranding=1${
      startSec ? `&start=${Math.floor(startSec)}` : ''
    }`;
  }
  const t = twitchChannel(u);
  if (t) {
    return `https://player.twitch.tv/?channel=${t}&parent=${location.hostname}&muted=${muted}&autoplay=true`;
  }
  const vm = vimeoId(u);
  if (vm) {
    return `https://player.vimeo.com/video/${vm}?autoplay=1&muted=${muted ? 1 : 0}`;
  }
  if (/youtube\.com\/embed|player\.twitch\.tv|player\.vimeo\.com|archive\.org\/embed/i.test(u)) {
    return u;
  }
  return null;
};

const ReelloStageMedia: React.FC<{
  playback?: OnAirPlayback;
  muted: boolean;
  playing: boolean;
  title: string;
}> = ({ playback, muted, playing, title }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !playback || playback.kind === 'embed') return;
    v.muted = muted;
    const seek = () => {
      if (playback.offsetSec && Number.isFinite(v.duration) && playback.offsetSec < v.duration) {
        try {
          v.currentTime = playback.offsetSec;
        } catch {
          /* ignore */
        }
      }
    };
    v.addEventListener('loadedmetadata', seek, { once: true });
    let hls: Hls | null = null;
    if (
      playback.kind === 'hls' &&
      Hls.isSupported()
    ) {
      hls = new Hls({ ...hlsTuning(), liveSyncDurationCount: 3 });
      hls.loadSource(playback.url);
      hls.attachMedia(v);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        capLevelsToPanel(hls as any);
        if (playing) v.play().catch(() => {});
      });
    } else {
      v.src = playback.url;
      if (playing) v.play().catch(() => {});
    }
    return () => {
      v.removeEventListener('loadedmetadata', seek);
      if (hls) {
        try {
          hls.destroy();
        } catch {
          /* ignore */
        }
      }
      v.removeAttribute('src');
      v.load();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback?.kind, playback?.url, playback?.offsetSec]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !playback || playback.kind === 'embed') return;
    if (playing) v.play().catch(() => {});
    else v.pause();
  }, [playing, playback]);

  if (!playback) return null;

  if (playback.kind === 'embed') {
    const src = buildEmbedSrc(playback.url, muted, playback.offsetSec);
    if (!src) return null;
    return (
      <iframe
        key={src}
        src={src}
        title={title}
        className="absolute inset-0 w-full h-full z-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }

  return (
    <video
      ref={videoRef}
      className="absolute inset-0 w-full h-full object-cover z-0 bg-black"
      poster={playback.poster}
      muted={muted}
      autoPlay
      playsInline
      loop={playback.kind === 'file'}
    />
  );
};

interface TimestampedMemberNote {
  id: string;
  streamId: string;
  streamTitle: string;
  timecodeSec: number;
  verseLabel: string;
  ref: ScriptureRef;
  text: string;
  createdAt: number;
}

const LECTIO_SKINS = [
  {
    id: 'vellum',
    label: 'Vellum',
    bg: 'radial-gradient(120% 90% at 30% 0%, #F7F1E2 0%, #EFE7D4 55%, #E7DDC6 100%)',
    ink: '#241E14',
    muted: '#7B7059',
    num: '#A8862E',
    mark: 'rgba(226, 194, 126,0.34)',
  },
  {
    id: 'lamplight',
    label: 'Lamplight',
    bg: 'radial-gradient(120% 90% at 50% 0%, #2A2015 0%, #1B140C 60%, #120D07 100%)',
    ink: '#F0E2C6',
    muted: '#9A8A6C',
    num: '#E2C27E',
    mark: 'rgba(226, 194, 126,0.26)',
  },
  {
    id: 'onion',
    label: 'Onion Skin',
    bg: 'linear-gradient(180deg, #FBFAF7 0%, #F3F2EE 100%)',
    ink: '#1E1E22',
    muted: '#77777F',
    num: '#8A7430',
    mark: 'rgba(160,140,60,0.28)',
  },
  {
    id: 'night',
    label: 'Night',
    bg: 'linear-gradient(180deg, #0C0B12 0%, #08070C 100%)',
    ink: '#DED8EA',
    muted: '#6E6688',
    num: '#E2C27E',
    mark: 'rgba(226, 194, 126,0.2)',
  },
] as const;

const STREAM_NOTES_STORAGE_KEY = 'plajah_rello_church_viewer_notes_v1';

interface RelloChurchViewerProps {
  org: Organization;
  onOpenFullLectio?: (ref: ScriptureRef) => void;
  inSanctuaryAutoEngaged?: boolean;
  defaultPlayerExpanded?: boolean;
  /** Active member of the org — unlocks members-only (Sanctuary) streams and channel sources. */
  viewerIsOrgMember?: boolean;
  /** Full-screen hand-off for the always-on window (Live TV+ / the live player). */
  onOpenOnAir?: (item: OnAirItem) => void;
}

const NOTHING_ON_AIR: ChurchStreamItem = {
  id: 'nothing-on-air', title: '', ministryChannelName: '', speaker: '', kind: 'LIVE_SANCTUARY',
  badgeText: '', thumbnailGradient: 'linear-gradient(135deg, #18141F, #0E0C13)', durationSec: 1, initialPlayheadSec: 0, scriptureCues: [],
};

export const RelloChurchViewer: React.FC<RelloChurchViewerProps> = ({
  org,
  onOpenFullLectio,
  inSanctuaryAutoEngaged = false,
  defaultPlayerExpanded = true,
  viewerIsOrgMember = false,
  onOpenOnAir,
}) => {
  // Only the demo church shows sample channels; a real org shows its Live TV Hub feeds + LiveHub TV+ switcher.
  const demo = isDemoOrg(org);
  const liveFeeds = useOrgLive(org, viewerIsOrgMember);
  const orgChannels = useOrgChannels(org, viewerIsOrgMember);
  const liveHubSources = useLiveHubTvPlusSources(org, liveFeeds, orgChannels);
  const onAir = useMemo(() => onAirItems(liveFeeds, orgChannels), [liveFeeds, orgChannels]);
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'ORG_ONLY' | 'LIVEHUB_TV'>('ALL');

  // Subscribe to live Ambo AutoScripture & Kairos session
  const autoScripture = useSyncExternalStore(subscribeAutoScripture, getAutoScriptureState);
  const liveReading = useSyncExternalStore(subscribeScriptureReading, getScriptureReading);
  const [kairosSession, setKairosSession] = useState<ScriptureSession | null>(null);

  useEffect(() => {
    const sid = sessionIdFor(org.id);
    const unsub = listenToSession(sid, s => setKairosSession(s));
    return () => unsub();
  }, [org.id]);

  // Build unified carousel items combining live Firestore feeds/channels + rich sanctuary broadcasts
  const streamCatalog: ChurchStreamItem[] = useMemo(() => {
    const defaults: ChurchStreamItem[] = [
      {
        id: 'stream-main-sanctuary-live',
        title: `${org.name} · Sunday Morning Choral Eucharist & Homily`,
        ministryChannelName: 'Main Sanctuary Broadcast · Stage Production',
        speaker: 'Pastor Daniel Reyes',
        kind: 'LIVE_SANCTUARY',
        viewerCount: 418,
        badgeText: 'LIVE NOW · STAGE SYNC',
        thumbnailGradient:
          'radial-gradient(circle at 25% 20%, rgba(212, 0, 85,0.55), rgba(122, 31, 192,0.45) 48%, #090414 100%)',
        durationSec: 4500,
        initialPlayheadSec: 2052, // 34:12
        scriptureCues: [
          {
            programTC: 680,
            label: 'Psalm 27:4',
            ref: { book: 19, bookName: 'Psalms', chapter: 27, verse: 4 },
            sourceLabel: 'AMBO_PRODUCTION_CUE',
            spokenExcerpt: '“One thing have I desired of the Lord, that will I seek after…”',
          },
          {
            programTC: 1450,
            label: 'Isaiah 6:1-3',
            ref: { book: 23, bookName: 'Isaiah', chapter: 6, verse: 1 },
            sourceLabel: 'SPEECH_ASR_DETECTED',
            spokenExcerpt: '“Turn with me to the prophet Isaiah chapter six, verse one…”',
          },
          {
            programTC: 2052,
            label: '2 Corinthians 4:6',
            ref: { book: 47, bookName: '2 Corinthians', chapter: 4, verse: 6 },
            sourceLabel: 'AMBO_PRODUCTION_CUE',
            spokenExcerpt:
              '“For God, who commanded the light to shine out of darkness, hath shined in our hearts…”',
          },
          {
            programTC: 2890,
            label: 'John 1:14',
            ref: { book: 43, bookName: 'John', chapter: 1, verse: 14 },
            sourceLabel: 'SPEECH_ASR_DETECTED',
            spokenExcerpt: '“And the Word was made flesh, and dwelt among us…”',
          },
        ],
      },
      {
        id: 'stream-Sacred-Arts-24-7-tv',
        title: 'Sacred Arts & Polyphony 24/7 Ministry TV Channel',
        ministryChannelName: 'Choir, Organ & Sacred Music TV',
        speaker: 'Cathedral Schola Cantorum',
        kind: 'MINISTRY_TV_CHANNEL',
        viewerCount: 164,
        badgeText: '24/7 MINISTRY TV',
        thumbnailGradient:
          'radial-gradient(circle at 75% 25%, rgba(226, 194, 126,0.45), rgba(122, 31, 192,0.5) 50%, #080411 100%)',
        durationSec: 3600,
        initialPlayheadSec: 1120,
        scriptureCues: [
          {
            programTC: 300,
            label: 'Psalm 150:1-6',
            ref: { book: 19, bookName: 'Psalms', chapter: 150, verse: 1 },
            sourceLabel: 'AMBO_PRODUCTION_CUE',
            spokenExcerpt: '“Praise ye the Lord. Praise God in his sanctuary…”',
          },
          {
            programTC: 1120,
            label: 'Revelation 4:8',
            ref: { book: 66, bookName: 'Revelation', chapter: 4, verse: 8 },
            sourceLabel: 'AMBO_PRODUCTION_CUE',
            spokenExcerpt: '“Holy, holy, holy, Lord God Almighty, which was, and is, and is to come.”',
          },
        ],
      },
      {
        id: 'stream-youth-young-adults-live',
        title: 'Elevate Youth & Young Adults Chapel · Unashamed',
        ministryChannelName: 'NextGen Ministry TV Channel',
        speaker: 'Pastor Maya Lin-Robinson',
        kind: 'MINISTRY_TV_CHANNEL',
        viewerCount: 92,
        badgeText: 'CHAPEL STREAM',
        thumbnailGradient:
          'radial-gradient(circle at 30% 80%, rgba(56,189,248,0.42), rgba(122, 31, 192,0.5) 55%, #070310 100%)',
        durationSec: 3200,
        initialPlayheadSec: 945,
        scriptureCues: [
          {
            programTC: 945,
            label: 'Romans 8:28',
            ref: { book: 45, bookName: 'Romans', chapter: 8, verse: 28 },
            sourceLabel: 'SPEECH_ASR_DETECTED',
            spokenExcerpt:
              '“And we know that all things work together for good to them that love God…”',
          },
        ],
      },
      {
        id: 'stream-vespers-replay-archive',
        title: 'Midweek Candlelight Vespers & Patristic Exposition (Replay)',
        ministryChannelName: 'Reello On-Demand Archive · Timecode Synced',
        speaker: 'Pastor Daniel Reyes',
        kind: 'SERVICE_REPLAY',
        viewerCount: 1290,
        badgeText: 'REPLAY · TIMECODE SYNC',
        thumbnailGradient:
          'radial-gradient(circle at 50% 25%, rgba(226, 194, 126,0.35), rgba(42,7,22,0.75) 55%, #080412 100%)',
        durationSec: 3900,
        initialPlayheadSec: 1580,
        scriptureCues: [
          {
            programTC: 420,
            label: 'Psalm 141:2',
            ref: { book: 19, bookName: 'Psalms', chapter: 141, verse: 2 },
            sourceLabel: 'SPEECH_ASR_DETECTED',
            spokenExcerpt:
              '“Let my prayer be set forth before thee as incense; and the lifting up of my hands as the evening sacrifice.”',
          },
          {
            programTC: 1580,
            label: 'John 1:4-5',
            ref: { book: 43, bookName: 'John', chapter: 1, verse: 4 },
            sourceLabel: 'SPEECH_ASR_DETECTED',
            spokenExcerpt: '“In him was life; and the life was the light of men…”',
          },
        ],
      },
    ];

    const gradients = [
      defaults[0].thumbnailGradient,
      defaults[1].thumbnailGradient,
      defaults[2].thumbnailGradient,
      defaults[3].thumbnailGradient,
    ];

    const dynamicItems: ChurchStreamItem[] = liveHubSources.map((src, idx) => ({
      id: src.id,
      title: src.title,
      ministryChannelName: src.channelName,
      speaker: src.speaker,
      kind: src.kind,
      viewerCount: src.viewerCount,
      badgeText: src.badgeText,
      videoUrl: src.playback.url,
      playback: src.playback,
      isOrgOwned: src.isOrgOwned,
      channelNumber: src.number,
      onAirItem: {
        key: src.id,
        title: src.title,
        subtitle: src.channelName,
        playback: src.playback,
        feed: src.feed,
        channel: src.channel,
      },
      thumbnailGradient: gradients[idx % gradients.length],
      durationSec: 3600,
      initialPlayheadSec: src.playback.offsetSec || 0,
      scriptureCues: defaults[0].scriptureCues,
    }));

    if (demo) {
      return [...dynamicItems, ...defaults];
    }

    if (dynamicItems.length > 0) {
      return dynamicItems;
    }

    // Fallback standby item for the organization so the Reello Player + Verse Mini-Bible is never blank while loading
    return [
      {
        ...defaults[0],
        id: `org-standby-${org.id}`,
        title: `${org.name} · Live Sanctuary & LiveHub TV+ Broadcast`,
        ministryChannelName: `${org.name} · Reello & LiveHub TV+`,
        speaker: org.name,
        badgeText: 'STANDBY · LIVEHUB TV+',
        isOrgOwned: true,
      },
    ];
  }, [liveHubSources, org.id, org.name, demo]);

  const filteredCatalog = useMemo(() => {
    if (sourceFilter === 'ORG_ONLY') {
      const orgItems = streamCatalog.filter(s => s.isOrgOwned);
      return orgItems.length > 0 ? orgItems : streamCatalog;
    }
    if (sourceFilter === 'LIVEHUB_TV') {
      const hubItems = streamCatalog.filter(s => !!s.playback);
      return hubItems.length > 0 ? hubItems : streamCatalog;
    }
    return streamCatalog;
  }, [streamCatalog, sourceFilter]);

  const [selectedStreamId, setSelectedStreamId] = useState<string>(
    () => streamCatalog[0]?.id ?? 'stream-main-sanctuary-live'
  );
  const userPickedStreamRef = useRef(false);

  // Automatically switch to the organization's real live broadcast (or first LiveHub TV+ source) as soon as it arrives!
  useEffect(() => {
    if (userPickedStreamRef.current && streamCatalog.some(s => s.id === selectedStreamId && s.playback)) {
      return;
    }
    const orgPlayable = streamCatalog.find(s => s.isOrgOwned && s.playback);
    if (orgPlayable && selectedStreamId !== orgPlayable.id) {
      setSelectedStreamId(orgPlayable.id);
      return;
    }
    const anyPlayable = streamCatalog.find(s => s.playback);
    if (anyPlayable && !streamCatalog.find(s => s.id === selectedStreamId)?.playback) {
      setSelectedStreamId(anyPlayable.id);
      return;
    }
    if (!streamCatalog.some(s => s.id === selectedStreamId) && streamCatalog[0]) {
      setSelectedStreamId(streamCatalog[0].id);
    }
  }, [streamCatalog, selectedStreamId]);

  const activeStream = useMemo(
    () => streamCatalog.find(s => s.id === selectedStreamId) ?? streamCatalog[0] ?? NOTHING_ON_AIR,
    [streamCatalog, selectedStreamId]
  );

  const [playerExpanded, setPlayerExpanded] = useState<boolean>(defaultPlayerExpanded);
  const [playing, setPlaying] = useState<boolean>(true);
  const [muted, setMuted] = useState<boolean>(true);
  const [playheadSec, setPlayheadSec] = useState<number>(activeStream.initialPlayheadSec);
  const [lectioMiniMounted, setLectioMiniMounted] = useState<boolean>(true);
  const [skinId, setSkinId] = useState<string>('lamplight');
  const [translation, setTranslation] = useState<string>(DEFAULT_TRANSLATION);
  const [chapterVerses, setChapterVerses] = useState<BibleVerse[]>([]);
  const [loadingVerses, setLoadingVerses] = useState<boolean>(false);
  const [noteDraft, setNoteDraft] = useState<string>('');

  // Load persisted member stream notes
  const [memberNotes, setMemberNotes] = useState<TimestampedMemberNote[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(STREAM_NOTES_STORAGE_KEY) || 'null');
      if (Array.isArray(raw) && raw.length > 0) return raw;
    } catch {
      // ignore
    }
    return [
      {
        id: 'seed-note-1',
        streamId: 'stream-main-sanctuary-live',
        streamTitle: `${org.name} · Sunday Morning Choral Eucharist & Homily`,
        timecodeSec: 680,
        verseLabel: 'Psalm 27:4',
        ref: { book: 19, bookName: 'Psalms', chapter: 27, verse: 4 },
        text: '“To behold the beauty of the Lord and to inquire in His temple” — the foundation of our sanctuary posture.',
        createdAt: Date.now() - 1000 * 60 * 18,
      },
      {
        id: 'seed-note-2',
        streamId: 'stream-main-sanctuary-live',
        streamTitle: `${org.name} · Sunday Morning Choral Eucharist & Homily`,
        timecodeSec: 2052,
        verseLabel: '2 Corinthians 4:6',
        ref: { book: 47, bookName: '2 Corinthians', chapter: 4, verse: 6 },
        text: 'Uncreated light shining inside earthen vessels — cross-reference with John 1:4–5 and Plate 06 (Hesychast Light).',
        createdAt: Date.now() - 1000 * 60 * 4,
      },
    ];
  });

  // Reset playhead when switching streams
  useEffect(() => {
    setPlayheadSec(activeStream.initialPlayheadSec);
    setLectioMiniMounted(true);
  }, [activeStream.id, activeStream.initialPlayheadSec]);

  // Advance playhead smoothly when playing
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setPlayheadSec(prev => (prev + 1) % Math.max(1, activeStream.durationSec));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [playing, activeStream.durationSec]);

  // Determine the active Scripture Cue based on:
  // 1. Live Ambo Speech/Reading state (`liveReading`) if running
  // 2. Live Kairos Session (`resolveCue(kairosSession, isLive ? 'IN_ROOM' : 'STREAM', playheadSec)`)
  // 3. Stream/Replay Cue Markers (`activeStream.scriptureCues`) at or before `playheadSec`
  const isLiveStream = activeStream.kind !== 'SERVICE_REPLAY';

  const resolvedCueInfo = useMemo(() => {
    if (liveReading) {
      return {
        ref: {
          book: liveReading.book,
          bookName: liveReading.reference.replace(/\s+\d+.*$/, ''),
          chapter: liveReading.chapter,
          verse: liveReading.verse,
        } satisfies ScriptureRef,
        label: liveReading.reference,
        sourceBadge: 'STAGE LIVE SPEECH',
        spokenExcerpt: autoScripture.heard || 'Live speech scripture recognition active…',
        programTC: playheadSec,
      };
    }

    const kCue = resolveCue(kairosSession, isLiveStream ? 'IN_ROOM' : 'STREAM', playheadSec);
    if (kCue && kCue.refId) {
      const parts = kCue.refId.split('.').map(Number);
      if (parts.length >= 2) {
        return {
          ref: {
            book: parts[0],
            bookName: kCue.label.replace(/\s+\d+.*$/, ''),
            chapter: parts[1],
            verse: parts[2] || 1,
          } satisfies ScriptureRef,
          label: kCue.label,
          sourceBadge: isLiveStream ? 'STAGE PRODUCTION CUE' : 'KAIROS REPLAY TIMECODE',
          spokenExcerpt: kCue.lines.join(' '),
          programTC: kCue.programTC || playheadSec,
        };
      }
    }

    // Fallback to stream's cue timeline markers
    const cues = activeStream.scriptureCues;
    let activeMarker = cues[0];
    for (const c of cues) {
      if (c.programTC <= playheadSec) activeMarker = c;
    }
    // No cues yet (a real stream before anything is read, or nothing on air): a neutral opening passage.
    if (!activeMarker) {
      return {
        ref: { book: 43, bookName: 'John', chapter: 1, verse: 1 } satisfies ScriptureRef,
        label: 'John 1',
        sourceBadge: 'WAITING FOR THE FIRST READING',
        spokenExcerpt: '',
        programTC: playheadSec,
      };
    }
    return {
      ref: activeMarker.ref,
      label: activeMarker.label,
      sourceBadge:
        activeMarker.sourceLabel === 'AMBO_PRODUCTION_CUE'
          ? isLiveStream
            ? 'STAGE PRODUCTION TEAM'
            : 'RECORDED STAGE CUE'
          : 'STREAM SPEECH DETECTION',
      spokenExcerpt: activeMarker.spokenExcerpt,
      programTC: activeMarker.programTC,
    };
  }, [liveReading, kairosSession, isLiveStream, playheadSec, activeStream.scriptureCues, autoScripture.heard]);

  // Fetch the full chapter verses for the Lectio Mini-Bible whenever the active passage or translation changes
  useEffect(() => {
    let cancelled = false;
    setLoadingVerses(true);
    getParallel(resolvedCueInfo.ref.book, resolvedCueInfo.ref.chapter, [translation])
      .then(res => {
        if (!cancelled) {
          setChapterVerses(res[translation] || []);
          setLoadingVerses(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadingVerses(false);
      });
    return () => {
      cancelled = true;
    };
  }, [resolvedCueInfo.ref.book, resolvedCueInfo.ref.chapter, translation]);

  const activeSkin = LECTIO_SKINS.find(s => s.id === skinId) ?? LECTIO_SKINS[1];

  const handleAddTimestampedNote = () => {
    const trimmed = noteDraft.trim();
    if (!trimmed) return;

    const newNote: TimestampedMemberNote = {
      id: `note_${Date.now()}`,
      streamId: activeStream.id,
      streamTitle: activeStream.title,
      timecodeSec: playheadSec,
      verseLabel: resolvedCueInfo.label,
      ref: resolvedCueInfo.ref,
      text: trimmed,
      createdAt: Date.now(),
    };

    const nextNotes = [newNote, ...memberNotes];
    setMemberNotes(nextNotes);
    try {
      localStorage.setItem(STREAM_NOTES_STORAGE_KEY, JSON.stringify(nextNotes));
    } catch {
      // ignore
    }

    // Also record into the shared Lectio serviceNotes + verseNotes stores so it appears in LectioReader & VespersRecap
    recordServiceNote({
      verseKey: verseKeyOf(resolvedCueInfo.ref),
      refId: refId(resolvedCueInfo.ref),
      label: resolvedCueInfo.label,
      sessionId: sessionIdFor(org.id),
      serviceTitle: activeStream.title,
      programTC: playheadSec,
    });

    const vKey = verseKeyOf(resolvedCueInfo.ref);
    const existingVerseNote = verseNotes.read()[vKey];
    const stampedLine = `[${formatTC(playheadSec)} · ${activeStream.ministryChannelName}] ${trimmed}`;
    verseNotes.write(vKey, existingVerseNote ? `${existingVerseNote}\n${stampedLine}` : stampedLine);

    setNoteDraft('');
  };

  const jumpToCueMarker = (programTC: number) => {
    setPlayheadSec(programTC);
    setLectioMiniMounted(true);
  };

  const selectStreamSource = (id: string) => {
    userPickedStreamRef.current = true;
    setSelectedStreamId(id);
    setPlayerExpanded(true);
    setPlaying(true);
  };

  const orgBroadcastCount = useMemo(
    () => streamCatalog.filter(s => s.isOrgOwned && s.playback).length,
    [streamCatalog]
  );
  const liveHubPlayableCount = useMemo(
    () => streamCatalog.filter(s => !!s.playback).length,
    [streamCatalog]
  );

  return (
    <div className="space-y-5">
      {/* ── 1. TOP LIVE STREAM & LIVEHUB TV+ CHANNEL CAROUSEL ── */}
      <div
        className="rounded-3xl p-5 border shadow-xl"
        style={{
          background: '#18141F',
          borderColor: 'rgba(255,255,255,0.06)',
        }}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="inline-flex items-center gap-2 ev-title text-lg text-white">
              <span className="ev-live-dot" />
              {org.orgType === 'CULTURAL' || org.orgType === 'NONPROFIT'
                ? 'Live & on demand'
                : 'Watch on Reello · LiveHub TV+'}
            </span>
            <span className="text-[13px] text-[#A49CB2] hidden sm:inline">
              Switch between {org.name} broadcasts &amp; LiveHub TV+ feeds with Verse Mini-Bible on the side
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Source Scope Switcher Pills */}
            <div className="flex items-center gap-1 bg-black/40 p-1 rounded-full border border-white/10">
              {(
                [
                  ['ALL', `All Sources (${streamCatalog.length})`],
                  ['ORG_ONLY', `${org.name} (${orgBroadcastCount || streamCatalog.filter(s => s.isOrgOwned).length})`],
                  ['LIVEHUB_TV', `LiveHub TV+ (${liveHubPlayableCount})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSourceFilter(key)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all ${
                    sourceFilter === key
                      ? 'bg-[#FF8C00] text-black shadow'
                      : 'text-white/65 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {inSanctuaryAutoEngaged && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 text-[10.5px] font-bold">
                <Navigation size={11} />
                <span>In the sanctuary · Stage synced</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setPlayerExpanded(v => !v)}
              className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all flex items-center gap-1.5"
              style={
                playerExpanded
                  ? {
                      background: 'rgba(255,255,255,0.08)',
                      borderColor: 'rgba(255,255,255,0.2)',
                      color: '#fff',
                    }
                  : {
                      background: '#E2C27E',
                      borderColor: '#E2C27E',
                      color: '#000',
                    }
              }
            >
              {playerExpanded ? <Pause size={10} /> : <Play size={10} />}
              <span>{playerExpanded ? 'Hide player' : 'Show player'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {filteredCatalog.slice(0, 8).map(item => {
            const isSelected = item.id === activeStream.id;
            return (
              <button
                key={item.id}
                onClick={() => selectStreamSource(item.id)}
                className={`text-left rounded-2xl p-3.5 border transition-all flex flex-col justify-between relative overflow-hidden group ${
                  isSelected && playerExpanded
                    ? 'ring-2 ring-[#E2C27E] scale-[1.01]'
                    : 'hover:border-[#D8D2E2]/40'
                }`}
                style={{
                  background: item.thumbnailGradient,
                  borderColor: isSelected && playerExpanded ? '#E2C27E' : 'rgba(216, 210, 226,0.18)',
                }}
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-1 ${
                      item.isOrgOwned
                        ? 'bg-[#D40055] text-white'
                        : item.kind === 'MINISTRY_TV_CHANNEL'
                        ? 'bg-[#7A1FC0] text-[#D8D2E2] border border-[#D8D2E2]/30'
                        : 'bg-black/60 text-[#E2C27E] border border-[#E2C27E]/40'
                    }`}
                  >
                    {item.kind === 'LIVE_SANCTUARY' ? (
                      <Radio size={9} />
                    ) : item.kind === 'MINISTRY_TV_CHANNEL' ? (
                      <Tv size={9} />
                    ) : (
                      <Clock size={9} />
                    )}
                    {item.badgeText}
                  </span>
                  {typeof item.viewerCount === 'number' && (
                    <span className="text-[10px] font-mono text-white/80 bg-black/45 px-2 py-0.5 rounded-full">
                      {item.viewerCount} watching
                    </span>
                  )}
                </div>

                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#E2C27E] truncate">
                    {item.ministryChannelName}
                  </div>
                  <div className="text-sm font-bold text-white leading-snug line-clamp-2 mt-0.5">
                    {item.title}
                  </div>
                  <div className="text-[11px] text-white/70 mt-1 flex items-center justify-between">
                    <span className="truncate">{item.speaker}</span>
                    <span className="inline-flex items-center gap-0.5 text-[#E2C27E] font-bold text-[10px] group-hover:translate-x-0.5 transition-transform">
                      {isSelected && playerExpanded ? 'Watching' : 'Switch Source'} <ChevronRight size={12} />
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 2. RELLO CHURCH VIEWER MODE + AUTO-MOUNTING LECTIO MINI-BIBLE ── */}
      {playerExpanded && (
      <div
        className="rounded-3xl border overflow-hidden shadow-2xl"
        style={{
          background: 'linear-gradient(165deg, #18141F 0%, #090314 60%, #05020B 100%)',
          borderColor: 'rgba(216, 210, 226, 0.22)',
        }}
      >
        {/* Rello Church Viewer Top Status Bar + LiveHub TV+ Source Switcher */}
        <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between gap-3 flex-wrap bg-black/40">
          <div className="flex items-center gap-2.5 flex-wrap min-w-0">
            <span className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest bg-[#7A1FC0] text-white border border-[#D8D2E2]/30">
              Reello Live Player
            </span>
            <span className="text-sm font-bold text-white truncate max-w-md">
              {activeStream.title}
            </span>
            {/* Inline Source Switcher Dropdown for LiveHub TV+ & Org Feeds */}
            {streamCatalog.length > 1 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#E2C27E] hidden sm:inline">
                  Source:
                </span>
                <select
                  aria-label="Switch Reello / LiveHub TV+ Source"
                  value={activeStream.id}
                  onChange={e => selectStreamSource(e.target.value)}
                  className="h-7 rounded-lg bg-white/10 border border-white/20 text-[11px] font-bold text-white px-2.5 outline-none focus:border-[#E2C27E] max-w-[260px]"
                >
                  {streamCatalog.map(s => (
                    <option key={s.id} value={s.id} className="bg-[#18141F] text-white">
                      {s.isOrgOwned ? `★ ${org.name}: ` : 'LiveHub TV+: '}
                      {s.title} ({s.ministryChannelName})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {onOpenOnAir && activeStream.onAirItem && (
              <button
                type="button"
                onClick={() => onOpenOnAir(activeStream.onAirItem!)}
                className="px-2.5 py-1 rounded-lg text-[10.5px] font-black uppercase tracking-wider bg-[#FF8C00]/20 border border-[#FF8C00]/50 text-[#FFB35C] hover:bg-[#FF8C00]/30 flex items-center gap-1.5 transition-all"
              >
                <Maximize2 size={11} />
                <span>Open in Live TV+</span>
              </button>
            )}

            <span
              className="px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5 border"
              style={{
                background: isLiveStream ? 'rgba(212, 0, 85,0.18)' : 'rgba(226, 194, 126,0.15)',
                borderColor: isLiveStream ? 'rgba(212, 0, 85,0.45)' : 'rgba(226, 194, 126,0.4)',
                color: isLiveStream ? '#FFB3D1' : '#F0D9A6',
              }}
            >
              <Mic size={11} />
              <span>
                {isLiveStream
                  ? 'Live Sync: Stage Service Production Team + Speech ASR'
                  : 'Replay Sync: Playhead Timecode + Speech Scripture Detection'}
              </span>
            </span>

            <button
              onClick={() => setLectioMiniMounted(v => !v)}
              className="px-3 py-1 rounded-lg text-[10.5px] font-bold border flex items-center gap-1.5 transition-all"
              style={
                lectioMiniMounted
                  ? {
                      background: 'rgba(226, 194, 126,0.2)',
                      borderColor: '#E2C27E',
                      color: '#F0D9A6',
                    }
                  : {
                      background: 'rgba(255,255,255,0.06)',
                      borderColor: 'rgba(255,255,255,0.15)',
                      color: '#fff',
                    }
              }
            >
              <BookOpen size={12} />
              <span>{lectioMiniMounted ? 'Verse Mini-Bible Mounted' : 'Mount Verse Mini-Bible'}</span>
            </button>
          </div>
        </div>

        {/* Main Split Workbench: Left 7 Cols Video + Timestamped Notes | Right 5 Cols Auto-Mounted Lectio Mini-Bible */}
        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* Left Column: Video Stage, Cue Scrub Timeline & Timestamped Stream Notes */}
          <div
            className={`${
              lectioMiniMounted ? 'lg:col-span-7' : 'lg:col-span-12'
            } p-5 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-white/10 space-y-4`}
          >
            {/* 16:9 Sanctuary Stream Canvas with Real Live Video Playback */}
            <div
              className="relative rounded-2xl overflow-hidden border border-white/15 aspect-video flex flex-col justify-between p-5 bg-black"
              style={{ background: activeStream.thumbnailGradient }}
            >
              {/* Actual LiveHub TV+ / Organization HLS, MP4, or Embed Stream Player */}
              <ReelloStageMedia
                playback={activeStream.playback}
                muted={muted}
                playing={playing}
                title={activeStream.title}
              />

              {/* Top Overlay Badges */}
              <div className="flex items-center justify-between gap-2 z-10 pointer-events-none">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider bg-black/70 text-white border border-white/15 flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isLiveStream ? 'bg-[#D40055] animate-ping' : 'bg-[#E2C27E]'
                      }`}
                    />
                    {activeStream.playback ? 'ON AIR · LIVEHUB TV+' : isLiveStream ? 'LIVE STREAM' : 'ON-DEMAND REPLAY'} · {formatTC(playheadSec)}
                  </span>
                  <span className="px-2.5 py-1 rounded-md text-[10px] font-mono bg-black/60 text-[#D8D2E2] border border-white/10">
                    {activeStream.speaker}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 pointer-events-auto">
                  <button
                    onClick={() => setMuted(m => !m)}
                    className="px-2.5 h-8 rounded-lg bg-black/70 hover:bg-black/90 border border-white/20 flex items-center gap-1.5 text-white text-[11px] font-bold"
                    title={muted ? 'Unmute stream' : 'Mute stream'}
                  >
                    {muted ? (
                      <>
                        <VolumeX size={14} />
                        <span>Tap to unmute</span>
                      </>
                    ) : (
                      <Volume2 size={14} />
                    )}
                  </button>
                  <button
                    onClick={() => setPlaying(p => !p)}
                    className="w-8 h-8 rounded-lg bg-black/70 hover:bg-black/90 border border-white/20 flex items-center justify-center text-white"
                    title={playing ? 'Pause' : 'Play'}
                  >
                    {playing ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                </div>
              </div>

              {/* Center Sanctuary Stage Caption / Ambo Detection Callout (shown when no video stream is playing or when live speech/cue is active) */}
              {(!activeStream.playback || liveReading || kairosSession) && (
                <div className="my-auto text-center max-w-xl mx-auto px-4 z-10 pointer-events-none">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/65 border border-[#E2C27E]/50 text-[#F0D9A6] text-[10px] font-extrabold uppercase tracking-widest mb-2">
                    <Sparkles size={11} />
                    <span>{resolvedCueInfo.sourceBadge} · Auto-Mounted in Verse</span>
                  </div>
                  <p className="text-base sm:text-lg font-serif italic text-white drop-shadow">
                    {resolvedCueInfo.spokenExcerpt}
                  </p>
                </div>
              )}

              {/* Lower-Third Scripture Banner inside Stream */}
              <div className="z-10 bg-black/75 backdrop-blur-md rounded-xl p-3 border border-[#E2C27E]/40 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#E2C27E]">
                    Active Sanctuary Passage · {resolvedCueInfo.label} ({translation.toUpperCase()})
                  </div>
                  <div className="text-xs text-white/85 line-clamp-1 mt-0.5">
                    {chapterVerses.find(v => v.verse === (resolvedCueInfo.ref.verse ?? 1))?.text ||
                      resolvedCueInfo.spokenExcerpt}
                  </div>
                </div>
                {onOpenFullLectio && (
                  <button
                    onClick={() => onOpenFullLectio(resolvedCueInfo.ref)}
                    className="px-2.5 py-1.5 rounded-lg bg-[#E2C27E] text-black text-[10px] font-black whitespace-nowrap flex items-center gap-1"
                  >
                    <Maximize2 size={11} />
                    <span>Full Verse</span>
                  </button>
                )}
              </div>
            </div>

            {/* Interactive Scripture Cue Markers Along Stream Timeline */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10.5px] text-[#D8D2E2]/70">
                <span className="font-bold uppercase tracking-wider">
                  Stream Scripture Cues (Click to Jump Playhead & Sync Mini-Bible)
                </span>
                <span className="font-mono">
                  {formatTC(playheadSec)} / {formatTC(activeStream.durationSec)}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {activeStream.scriptureCues.map(cue => {
                  const isCurrent = resolvedCueInfo.label === cue.label;
                  return (
                    <button
                      key={`${cue.label}_${cue.programTC}`}
                      onClick={() => jumpToCueMarker(cue.programTC)}
                      className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold border transition-all flex items-center gap-1.5 ${
                        isCurrent
                          ? 'bg-[#E2C27E] text-black border-[#E2C27E]'
                          : 'bg-white/5 text-white/75 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <span className="font-mono text-[9.5px] opacity-80">
                        [{formatTC(cue.programTC)}]
                      </span>
                      <span>{cue.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Timestamped Stream & Video Notes Composer + Feed */}
            <div className="rounded-2xl p-4 bg-black/35 border border-white/10 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                  <MessageSquarePlus size={14} className="text-[#E2C27E]" />
                  <span>Timestamped Stream & Sermon Notes</span>
                </div>
                <span className="text-[10px] font-mono text-[#E2C27E]">
                  Stamping at [{formatTC(playheadSec)}] · {resolvedCueInfo.label}
                </span>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={noteDraft}
                  onChange={e => setNoteDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAddTimestampedNote();
                  }}
                  placeholder={`Add a note stamped to [${formatTC(playheadSec)}] on ${resolvedCueInfo.label}…`}
                  className="flex-1 h-9 px-3 rounded-xl bg-white/5 border border-white/15 text-xs text-white placeholder:text-white/40 outline-none focus:border-[#E2C27E]"
                />
                <button
                  onClick={handleAddTimestampedNote}
                  className="px-3.5 h-9 rounded-xl text-xs font-black text-black flex items-center gap-1.5 whitespace-nowrap hover:brightness-110 transition-all"
                  style={{ background: '#E2C27E' }}
                >
                  <Plus size={13} />
                  <span>Stamp Note [{formatTC(playheadSec)}]</span>
                </button>
              </div>

              <div className="space-y-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                {memberNotes.map(n => (
                  <div
                    key={n.id}
                    className="p-2.5 rounded-xl bg-white/[0.04] border border-white/10 flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => jumpToCueMarker(n.timecodeSec)}
                          className="px-1.5 py-0.5 rounded bg-[#7A1FC0]/60 border border-[#D8D2E2]/30 text-[#D8D2E2] font-mono text-[10px] font-bold hover:bg-[#7A1FC0]"
                          title="Jump video/stream to this timestamp"
                        >
                          [{formatTC(n.timecodeSec)}]
                        </button>
                        <span className="font-bold text-[#E2C27E] text-[11px]">{n.verseLabel}</span>
                      </div>
                      <p className="text-white/85 text-[11.5px] leading-snug">{n.text}</p>
                    </div>
                    <span title="Saved to Verse Notebook" className="shrink-0 mt-1">
                      <CheckCircle2 size={13} className="text-emerald-400" />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Auto-Mounting Lectio Mini-Bible (Same skins & translations as LectioReader) */}
          {lectioMiniMounted && (
            <div className="lg:col-span-5 flex flex-col justify-between min-h-[520px]">
              {/* Mini-Bible Chrome Header */}
              <div className="p-3.5 border-b border-white/10 bg-black/45 flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#E2C27E]">
                    <BookOpen size={11} />
                    <span>Verse Mini-Bible · Auto-Mounted</span>
                  </div>
                  <div className="text-sm font-bold text-white">
                    {formatRef(resolvedCueInfo.ref, 'display')}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <select
                    value={translation}
                    onChange={e => setTranslation(e.target.value)}
                    aria-label="Bible Translation"
                    className="h-7 rounded-lg bg-white/10 border border-white/15 text-[10.5px] font-bold text-white px-2"
                  >
                    {TRANSLATIONS.slice(0, 6).map(t => (
                      <option key={t.slug} value={t.slug} className="bg-[#18141F] text-white">
                        {t.label}
                      </option>
                    ))}
                  </select>

                  {/* Same 4 Lectio Reading Surface Skins */}
                  <div className="flex items-center gap-1 pl-1">
                    {LECTIO_SKINS.map(s => (
                      <button
                        key={s.id}
                        onClick={() => setSkinId(s.id)}
                        title={`${s.label} Verse Surface`}
                        className={`w-4 h-4 rounded-full border transition-all ${
                          s.id === skinId ? 'border-[#E2C27E] scale-115' : 'border-white/25'
                        }`}
                        style={{ background: s.bg }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Skinned Lectio Reading Surface */}
              <div
                className="flex-1 p-5 overflow-y-auto max-h-[460px] custom-scrollbar"
                style={{ background: activeSkin.bg, color: activeSkin.ink }}
              >
                <div
                  className="text-[9.5px] font-black uppercase tracking-[0.22em] mb-3 flex items-center justify-between"
                  style={{ color: activeSkin.num }}
                >
                  <span>
                    {resolvedCueInfo.ref.bookName} {resolvedCueInfo.ref.chapter} ·{' '}
                    {translation.toUpperCase()}
                  </span>
                  <span>{resolvedCueInfo.sourceBadge}</span>
                </div>

                {loadingVerses ? (
                  <div className="py-16 text-center text-xs italic" style={{ color: activeSkin.muted }}>
                    Syncing chapter from Verse witness cache…
                  </div>
                ) : chapterVerses.length === 0 ? (
                  <div className="space-y-3 font-serif text-sm leading-relaxed">
                    <p
                      className="p-3 rounded-lg"
                      style={{ background: activeSkin.mark, color: activeSkin.ink }}
                    >
                      <strong style={{ color: activeSkin.num }}>
                        {resolvedCueInfo.ref.verse ?? 1}{' '}
                      </strong>
                      {resolvedCueInfo.spokenExcerpt}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 font-serif text-[14.5px] leading-relaxed">
                    {chapterVerses.slice(0, 18).map(v => {
                      const isCalledVerse = v.verse === (resolvedCueInfo.ref.verse ?? 1);
                      return (
                        <p
                          key={v.verse}
                          className="px-2.5 py-1 rounded-lg transition-colors"
                          style={
                            isCalledVerse
                              ? {
                                  background: activeSkin.mark,
                                  borderLeft: `3px solid ${activeSkin.num}`,
                                  fontWeight: 600,
                                }
                              : undefined
                          }
                        >
                          <span
                            className="font-mono text-[10px] font-bold mr-1.5 align-super"
                            style={{ color: activeSkin.num }}
                          >
                            {v.verse}
                          </span>
                          {v.text}
                        </p>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Mini-Bible Footer */}
              <div className="px-4 py-2.5 border-t border-white/10 bg-black/50 flex items-center justify-between text-[10.5px] text-white/70">
                <span>
                  {isLiveStream
                    ? 'Synced with Stage Production Team & Live Speech Detection'
                    : 'Synced with Replay Timecode & Caption Scripture Detection'}
                </span>
                {onOpenFullLectio && (
                  <button
                    onClick={() => onOpenFullLectio(resolvedCueInfo.ref)}
                    className="text-[#E2C27E] font-bold hover:underline flex items-center gap-1"
                  >
                    <span>Open Workbench</span>
                    <ChevronRight size={12} />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
};

export default RelloChurchViewer;
