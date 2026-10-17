// components/elevate/RelloChurchViewer.tsx
// Top Ministry TV Channel & Live Stream Carousel + Inline Rello Church Viewer Mode
// with Auto-Mounting Lectio Mini-Bible (synced to Ambo Production Team on Live Streams
// or Playhead Timecode + Speech Detection on Replays) and Timestamped Stream Notes.

import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
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
import { useOrgLive, useOrgChannels } from '../../services/orgMedia';
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
  viewerCount: number;
  badgeText: string;
  videoUrl?: string;
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
    mark: 'rgba(212,175,55,0.34)',
  },
  {
    id: 'lamplight',
    label: 'Lamplight',
    bg: 'radial-gradient(120% 90% at 50% 0%, #2A2015 0%, #1B140C 60%, #120D07 100%)',
    ink: '#F0E2C6',
    muted: '#9A8A6C',
    num: '#D4AF37',
    mark: 'rgba(212,175,55,0.26)',
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
    num: '#D4AF37',
    mark: 'rgba(212,175,55,0.2)',
  },
] as const;

const STREAM_NOTES_STORAGE_KEY = 'plajah_rello_church_viewer_notes_v1';

interface RelloChurchViewerProps {
  org: Organization;
  onOpenFullLectio?: (ref: ScriptureRef) => void;
  inSanctuaryAutoEngaged?: boolean;
}

export const RelloChurchViewer: React.FC<RelloChurchViewerProps> = ({
  org,
  onOpenFullLectio,
  inSanctuaryAutoEngaged = true,
}) => {
  const liveFeeds = useOrgLive(org, true);
  const orgChannels = useOrgChannels(org, true);

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
        ministryChannelName: 'Main Sanctuary Broadcast · Ambo Pro Production',
        speaker: 'Rev. Dr. Elias Vance',
        kind: 'LIVE_SANCTUARY',
        viewerCount: 418,
        badgeText: 'LIVE NOW · AMBO SYNC',
        thumbnailGradient:
          'radial-gradient(circle at 25% 20%, rgba(212,0,85,0.55), rgba(107,0,153,0.45) 48%, #090414 100%)',
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
          'radial-gradient(circle at 75% 25%, rgba(232,193,112,0.45), rgba(107,0,153,0.5) 50%, #080411 100%)',
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
          'radial-gradient(circle at 30% 80%, rgba(56,189,248,0.42), rgba(107,0,153,0.5) 55%, #070310 100%)',
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
        ministryChannelName: 'Rello On-Demand Archive · Timecode Synced',
        speaker: 'Rev. Dr. Elias Vance',
        kind: 'SERVICE_REPLAY',
        viewerCount: 1290,
        badgeText: 'REPLAY · TIMECODE SYNC',
        thumbnailGradient:
          'radial-gradient(circle at 50% 25%, rgba(232,193,112,0.35), rgba(42,7,22,0.75) 55%, #080412 100%)',
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

    // Prepend any live Firestore feeds or org channels if present
    const dynamicFeeds: ChurchStreamItem[] = liveFeeds.map((f, idx) => ({
      id: `live-feed-${f.id}`,
      title: f.title,
      ministryChannelName: (f as any).channelName || f.ownerName || `${org.name} Live`,
      speaker: (f as any).hostName || f.ownerName,
      kind: 'LIVE_SANCTUARY',
      viewerCount: (f as any).viewerCount || 120 + idx * 15,
      badgeText: 'LIVE NOW · AMBO SYNC',
      videoUrl: (f as any).videoUrl || (f as any).streamUrl,
      thumbnailGradient: defaults[0].thumbnailGradient,
      durationSec: 3600,
      initialPlayheadSec: 1800,
      scriptureCues: defaults[0].scriptureCues,
    }));

    const dynamicChannels: ChurchStreamItem[] = orgChannels.map(ch => ({
      id: `org-channel-${ch.key}`,
      title: ch.name,
      ministryChannelName: ch.nowPlaying || 'Ministry TV Channel',
      speaker: org.name,
      kind: 'MINISTRY_TV_CHANNEL',
      viewerCount: 85,
      badgeText: 'LIVE TV CHANNEL',
      thumbnailGradient: defaults[1].thumbnailGradient,
      durationSec: 3600,
      initialPlayheadSec: 900,
      scriptureCues: defaults[1].scriptureCues,
    }));

    return [...dynamicFeeds, ...dynamicChannels, ...defaults];
  }, [liveFeeds, orgChannels, org.name]);

  const [selectedStreamId, setSelectedStreamId] = useState<string>(
    () => streamCatalog[0]?.id ?? 'stream-main-sanctuary-live'
  );
  const activeStream = useMemo(
    () => streamCatalog.find(s => s.id === selectedStreamId) ?? streamCatalog[0],
    [streamCatalog, selectedStreamId]
  );

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
        sourceBadge: 'AMBO LIVE SPEECH ASR',
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
          sourceBadge: isLiveStream ? 'AMBO PRODUCTION TEAM CUE' : 'KAIROS REPLAY TIMECODE',
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
    return {
      ref: activeMarker.ref,
      label: activeMarker.label,
      sourceBadge:
        activeMarker.sourceLabel === 'AMBO_PRODUCTION_CUE'
          ? isLiveStream
            ? 'AMBO SERVICE PRODUCTION TEAM'
            : 'RECORDED AMBO CUE'
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

  return (
    <div className="space-y-5">
      {/* ── 1. TOP LIVE STREAM & MINISTRY TV CHANNEL CAROUSEL ── */}
      <div
        className="rounded-3xl p-5 border shadow-xl"
        style={{
          background:
            'linear-gradient(145deg, rgba(24, 11, 46, 0.92) 0%, rgba(13, 6, 26, 0.95) 100%)',
          borderColor: 'rgba(232, 193, 112, 0.28)',
        }}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3.5">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-[#D40055] text-white shadow-[0_0_16px_rgba(212,0,85,0.5)]">
              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              Live Sanctuary & Ministry TV Channels
            </span>
            <span className="text-xs text-[#E0CEFF]/75 hidden sm:inline">
              Drop directly into a live broadcast or 24/7 ministry TV channel — Rello Church Viewer & Lectio Mini-Bible auto-engage below
            </span>
          </div>

          {inSanctuaryAutoEngaged && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 text-[10.5px] font-bold">
              <Navigation size={11} />
              <span>Schedule + GPS Sanctuary Lock Active · Ambo Dictation Synced</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {streamCatalog.slice(0, 4).map(item => {
            const isSelected = item.id === activeStream.id;
            return (
              <button
                key={item.id}
                onClick={() => setSelectedStreamId(item.id)}
                className={`text-left rounded-2xl p-3.5 border transition-all flex flex-col justify-between relative overflow-hidden group ${
                  isSelected
                    ? 'ring-2 ring-[#E8C170] scale-[1.01]'
                    : 'hover:border-[#E0CEFF]/40'
                }`}
                style={{
                  background: item.thumbnailGradient,
                  borderColor: isSelected ? '#E8C170' : 'rgba(224,206,255,0.18)',
                }}
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-1 ${
                      item.kind === 'LIVE_SANCTUARY'
                        ? 'bg-[#D40055] text-white'
                        : item.kind === 'MINISTRY_TV_CHANNEL'
                        ? 'bg-[#6B0099] text-[#E0CEFF] border border-[#E0CEFF]/30'
                        : 'bg-black/60 text-[#E8C170] border border-[#E8C170]/40'
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
                  <span className="text-[10px] font-mono text-white/80 bg-black/45 px-2 py-0.5 rounded-full">
                    {item.viewerCount} watching
                  </span>
                </div>

                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#E8C170] truncate">
                    {item.ministryChannelName}
                  </div>
                  <div className="text-sm font-bold text-white leading-snug line-clamp-2 mt-0.5">
                    {item.title}
                  </div>
                  <div className="text-[11px] text-white/70 mt-1 flex items-center justify-between">
                    <span className="truncate">{item.speaker}</span>
                    <span className="inline-flex items-center gap-0.5 text-[#E8C170] font-bold text-[10px] group-hover:translate-x-0.5 transition-transform">
                      {isSelected ? 'Watching' : 'Drop In'} <ChevronRight size={12} />
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 2. RELLO CHURCH VIEWER MODE + AUTO-MOUNTING LECTIO MINI-BIBLE ── */}
      <div
        className="rounded-3xl border overflow-hidden shadow-2xl"
        style={{
          background: 'linear-gradient(165deg, #120824 0%, #090314 60%, #05020B 100%)',
          borderColor: 'rgba(224, 206, 255, 0.22)',
        }}
      >
        {/* Rello Church Viewer Top Status Bar */}
        <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between gap-3 flex-wrap bg-black/40">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest bg-[#6B0099] text-white border border-[#E0CEFF]/30">
              Rello Church Viewer Mode
            </span>
            <span className="text-sm font-bold text-white truncate max-w-md">
              {activeStream.title}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5 border"
              style={{
                background: isLiveStream ? 'rgba(212,0,85,0.18)' : 'rgba(232,193,112,0.15)',
                borderColor: isLiveStream ? 'rgba(212,0,85,0.45)' : 'rgba(232,193,112,0.4)',
                color: isLiveStream ? '#FFB3D1' : '#FFE399',
              }}
            >
              <Mic size={11} />
              <span>
                {isLiveStream
                  ? 'Live Sync: Ambo Service Production Team + Speech ASR'
                  : 'Replay Sync: Playhead Timecode + Speech Scripture Detection'}
              </span>
            </span>

            <button
              onClick={() => setLectioMiniMounted(v => !v)}
              className="px-3 py-1 rounded-lg text-[10.5px] font-bold border flex items-center gap-1.5 transition-all"
              style={
                lectioMiniMounted
                  ? {
                      background: 'rgba(232,193,112,0.2)',
                      borderColor: '#E8C170',
                      color: '#FFE399',
                    }
                  : {
                      background: 'rgba(255,255,255,0.06)',
                      borderColor: 'rgba(255,255,255,0.15)',
                      color: '#fff',
                    }
              }
            >
              <BookOpen size={12} />
              <span>{lectioMiniMounted ? 'Lectio Mini-Bible Mounted' : 'Mount Lectio Mini-Bible'}</span>
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
            {/* 16:9 Sanctuary Stream Canvas */}
            <div
              className="relative rounded-2xl overflow-hidden border border-white/15 aspect-video flex flex-col justify-between p-5"
              style={{ background: activeStream.thumbnailGradient }}
            >
              {/* Top Overlay Badges */}
              <div className="flex items-center justify-between gap-2 z-10">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider bg-black/70 text-white border border-white/15 flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isLiveStream ? 'bg-[#D40055] animate-ping' : 'bg-[#E8C170]'
                      }`}
                    />
                    {isLiveStream ? 'LIVE STREAM' : 'ON-DEMAND REPLAY'} · {formatTC(playheadSec)}
                  </span>
                  <span className="px-2.5 py-1 rounded-md text-[10px] font-mono bg-black/60 text-[#E0CEFF] border border-white/10">
                    {activeStream.speaker}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setMuted(m => !m)}
                    className="w-8 h-8 rounded-lg bg-black/65 hover:bg-black/85 border border-white/15 flex items-center justify-center text-white"
                    title={muted ? 'Unmute stream' : 'Mute stream'}
                  >
                    {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  </button>
                  <button
                    onClick={() => setPlaying(p => !p)}
                    className="w-8 h-8 rounded-lg bg-black/65 hover:bg-black/85 border border-white/15 flex items-center justify-center text-white"
                    title={playing ? 'Pause' : 'Play'}
                  >
                    {playing ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                </div>
              </div>

              {/* Center Sanctuary Stage Caption / Ambo Detection Callout */}
              <div className="my-auto text-center max-w-xl mx-auto px-4 z-10">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/65 border border-[#E8C170]/50 text-[#FFE399] text-[10px] font-extrabold uppercase tracking-widest mb-2">
                  <Sparkles size={11} />
                  <span>{resolvedCueInfo.sourceBadge} · Auto-Mounted in Lectio</span>
                </div>
                <p className="text-base sm:text-lg font-serif italic text-white drop-shadow">
                  {resolvedCueInfo.spokenExcerpt}
                </p>
              </div>

              {/* Lower-Third Scripture Banner inside Stream */}
              <div className="z-10 bg-black/75 backdrop-blur-md rounded-xl p-3 border border-[#E8C170]/40 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#E8C170]">
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
                    className="px-2.5 py-1.5 rounded-lg bg-[#E8C170] text-black text-[10px] font-black whitespace-nowrap flex items-center gap-1"
                  >
                    <Maximize2 size={11} />
                    <span>Full Lectio</span>
                  </button>
                )}
              </div>
            </div>

            {/* Interactive Scripture Cue Markers Along Stream Timeline */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10.5px] text-[#E0CEFF]/70">
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
                          ? 'bg-[#E8C170] text-black border-[#E8C170]'
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
                  <MessageSquarePlus size={14} className="text-[#E8C170]" />
                  <span>Timestamped Stream & Sermon Notes</span>
                </div>
                <span className="text-[10px] font-mono text-[#E8C170]">
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
                  className="flex-1 h-9 px-3 rounded-xl bg-white/5 border border-white/15 text-xs text-white placeholder:text-white/40 outline-none focus:border-[#E8C170]"
                />
                <button
                  onClick={handleAddTimestampedNote}
                  className="px-3.5 h-9 rounded-xl text-xs font-black text-black flex items-center gap-1.5 whitespace-nowrap hover:brightness-110 transition-all"
                  style={{ background: '#E8C170' }}
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
                          className="px-1.5 py-0.5 rounded bg-[#6B0099]/60 border border-[#E0CEFF]/30 text-[#E0CEFF] font-mono text-[10px] font-bold hover:bg-[#6B0099]"
                          title="Jump video/stream to this timestamp"
                        >
                          [{formatTC(n.timecodeSec)}]
                        </button>
                        <span className="font-bold text-[#E8C170] text-[11px]">{n.verseLabel}</span>
                      </div>
                      <p className="text-white/85 text-[11.5px] leading-snug">{n.text}</p>
                    </div>
                    <span title="Saved to Lectio Notebook" className="shrink-0 mt-1">
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
                  <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#E8C170]">
                    <BookOpen size={11} />
                    <span>Lectio Mini-Bible · Auto-Mounted</span>
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
                      <option key={t.slug} value={t.slug} className="bg-[#120824] text-white">
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
                        title={`${s.label} Lectio Surface`}
                        className={`w-4 h-4 rounded-full border transition-all ${
                          s.id === skinId ? 'border-[#E8C170] scale-115' : 'border-white/25'
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
                    Syncing chapter from Lectio witness cache…
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
                    ? 'Synced with Ambo Production Team & Live Speech Detection'
                    : 'Synced with Replay Timecode & Caption Scripture Detection'}
                </span>
                {onOpenFullLectio && (
                  <button
                    onClick={() => onOpenFullLectio(resolvedCueInfo.ref)}
                    className="text-[#E8C170] font-bold hover:underline flex items-center gap-1"
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
    </div>
  );
};

export default RelloChurchViewer;
