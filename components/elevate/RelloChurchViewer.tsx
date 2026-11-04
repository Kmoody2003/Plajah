// components/elevate/RelloChurchViewer.tsx
// The org page's player: a carousel of the org's real broadcasts + LiveHub TV+ feeds, the Reello
// player, and — for faith institutions only — the scripture of that org's own faith on the side.
//
// The scripture panel follows what is actually playing. Each source has its own watch session
// (services/watchScripture): passages that came up and the notes the viewer stamped, kept in memory
// and in the viewer's notebook, so switching sources switches the panel and coming back restores it.
// Passages come only from the feed:
//   · speech heard in the stream itself — the same detector as Stage's auto scripture, run privately
//     on the player's audio (hooks/useFeedScripture); and
//   · the org's Stage team, for the org's own live service (the Kairos session).
// Nothing is seeded, for any org.

import { scopedKey } from '../../services/userScope';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  Radio, Tv, Play, Pause, BookOpen, Clock, Plus, Volume2, VolumeX, Maximize2, Minimize2, X,
  Navigation, MessageSquarePlus, ChevronRight, Trash2,
} from 'lucide-react';
import type { Organization } from '../../types';
import {
  useOrgLive, useOrgChannels, useLiveHubTvPlusSources, type OnAirItem, type OnAirPlayback,
} from '../../services/orgMedia';
import { hlsTuning, capLevelsToPanel } from '../../services/hlsTuning';
import { listenToSession, sessionIdFor, type ScriptureSession } from '../../services/kairosService';
import { DEFAULT_TRANSLATION } from '../../services/scriptureText';
import { parseRefId, type ScriptureRef } from '../../services/scriptureRef';
import { recordServiceNote, formatTC } from '../../services/serviceNotes';
import { verseNotes } from '../../services/readerNotes';
import { TRANSLATIONS } from '../../services/bibleService';
import type { ListenerHit } from '../../services/ambo/scriptureListener';
import {
  faithForOrg, faithHearsReferences, FAITH_SCRIPTURE_NAME, readWatchSession, addWatchPassage, addWatchNote,
  removeWatchNote, passageAt, syncWatchSessions, type WatchPassage, type WatchSession,
} from '../../services/watchScripture';
import { useFeedScripture } from '../../hooks/useFeedScripture';
import { EV, EV_FONT } from './vellum';
import VersePanel, { VERSE_SKINS, DEFAULT_VERSE_SKIN, TEXT_SIZES, usePassageText, type TextSizeId } from './VersePanel';
import LeafPlayer, { useLeafPhone, isLeafPhoneNow } from './LeafPlayer';

export interface ChurchStreamItem {
  id: string;
  title: string;
  ministryChannelName: string;
  speaker: string;
  kind: 'LIVE_SANCTUARY' | 'MINISTRY_TV_CHANNEL' | 'SERVICE_REPLAY';
  viewerCount?: number;
  badgeText: string;
  playback?: OnAirPlayback;
  isOrgOwned?: boolean;
  channelNumber?: number;
  onAirItem?: OnAirItem;
  thumbnailGradient: string;
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
  if (t) return `https://player.twitch.tv/?channel=${t}&parent=${location.hostname}&muted=${muted}&autoplay=true`;
  const vm = vimeoId(u);
  if (vm) return `https://player.vimeo.com/video/${vm}?autoplay=1&muted=${muted ? 1 : 0}`;
  if (/youtube\.com\/embed|player\.twitch\.tv|player\.vimeo\.com|archive\.org\/embed/i.test(u)) return u;
  return null;
};

const ReelloStageMedia: React.FC<{
  playback?: OnAirPlayback;
  muted: boolean;
  playing: boolean;
  title: string;
  /** The <video> element (null for an embed), for the playhead and the scripture listener. */
  onVideo?: (el: HTMLVideoElement | null) => void;
  onTime?: (sec: number) => void;
}> = ({ playback, muted, playing, title, onVideo, onTime }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onTimeRef = useRef(onTime);
  onTimeRef.current = onTime;
  const onVideoRef = useRef(onVideo);
  onVideoRef.current = onVideo;

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !playback || playback.kind === 'embed') return;
    v.muted = muted;
    const seek = () => {
      if (playback.offsetSec && Number.isFinite(v.duration) && playback.offsetSec < v.duration) {
        try { v.currentTime = playback.offsetSec; } catch { /* ignore */ }
      }
    };
    const tick = () => onTimeRef.current?.(v.currentTime);
    v.addEventListener('loadedmetadata', seek, { once: true });
    v.addEventListener('timeupdate', tick);
    let hls: Hls | null = null;
    if (playback.kind === 'hls' && Hls.isSupported()) {
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
    onVideoRef.current?.(v);
    return () => {
      onVideoRef.current?.(null);
      v.removeEventListener('loadedmetadata', seek);
      v.removeEventListener('timeupdate', tick);
      if (hls) { try { hls.destroy(); } catch { /* ignore */ } }
      v.removeAttribute('src');
      v.load();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback?.kind, playback?.url, playback?.offsetSec]);

  useEffect(() => { if (videoRef.current) videoRef.current.muted = muted; }, [muted]);

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

const GRADIENTS = [
  'radial-gradient(circle at 25% 20%, rgba(212, 0, 85,0.55), rgba(122, 31, 192,0.45) 48%, #090414 100%)',
  'radial-gradient(circle at 75% 25%, rgba(226, 194, 126,0.45), rgba(122, 31, 192,0.5) 50%, #080411 100%)',
  'radial-gradient(circle at 30% 80%, rgba(56,189,248,0.42), rgba(122, 31, 192,0.5) 55%, #070310 100%)',
  'radial-gradient(circle at 50% 25%, rgba(226, 194, 126,0.35), rgba(42,7,22,0.75) 55%, #080412 100%)',
];

const DISPLAY_KEY = 'plajah_verse_panel_display_v1';
const LISTEN_KEY = 'plajah_verse_panel_listen_v1';
const readDisplay = (): { skin?: string; size?: TextSizeId } => {
  try { return JSON.parse(localStorage.getItem(scopedKey(DISPLAY_KEY)) || '{}') || {}; } catch { return {}; }
};
const writeDisplay = (d: { skin?: string; size?: TextSizeId }) => {
  try { localStorage.setItem(scopedKey(DISPLAY_KEY), JSON.stringify(d)); } catch { /* private window */ }
};

interface RelloChurchViewerProps {
  org: Organization;
  onOpenFullLectio?: (ref: ScriptureRef) => void;
  inSanctuaryAutoEngaged?: boolean;
  defaultPlayerExpanded?: boolean;
  /** Active member of the org — unlocks members-only (Sanctuary) streams and channel sources. */
  viewerIsOrgMember?: boolean;
  /** Full-screen hand-off for the always-on window (Live TV+ / the live player). */
  onOpenOnAir?: (item: OnAirItem) => void;
  /** Off the main public page: shrink to a floating mini player (minimizable) so playback carries on. */
  compact?: boolean;
  /** Mini player's expand button — take the viewer back to the main page's full player. */
  onExpand?: () => void;
}

const NOTHING_ON_AIR: ChurchStreamItem = {
  id: 'nothing-on-air', title: '', ministryChannelName: '', speaker: '', kind: 'LIVE_SANCTUARY',
  badgeText: '', thumbnailGradient: 'linear-gradient(135deg, #18141F, #0E0C13)',
};

export const RelloChurchViewer: React.FC<RelloChurchViewerProps> = ({
  org,
  onOpenFullLectio,
  inSanctuaryAutoEngaged = false,
  defaultPlayerExpanded = true,
  viewerIsOrgMember = false,
  onOpenOnAir,
  compact = false,
  onExpand,
}) => {
  const liveFeeds = useOrgLive(org, viewerIsOrgMember);
  const orgChannels = useOrgChannels(org, viewerIsOrgMember);
  const liveHubSources = useLiveHubTvPlusSources(org, liveFeeds, orgChannels);
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'ORG_ONLY' | 'LIVEHUB_TV'>('ALL');

  // Which scripture this org's page shows — none for a nonprofit, business, label…
  const faith = faithForOrg(org);
  const scriptureName = faith ? FAITH_SCRIPTURE_NAME[faith] : '';

  // Only real sources: the org's own broadcasts and the LiveHub TV+ feeds it carries.
  const streamCatalog: ChurchStreamItem[] = useMemo(
    () => liveHubSources.map((src, idx) => ({
      id: src.id,
      title: src.title,
      ministryChannelName: src.channelName,
      speaker: src.speaker,
      kind: src.kind,
      viewerCount: src.viewerCount,
      badgeText: src.badgeText,
      playback: src.playback,
      isOrgOwned: src.isOrgOwned,
      channelNumber: src.number,
      onAirItem: { key: src.id, title: src.title, subtitle: src.channelName, playback: src.playback, feed: src.feed, channel: src.channel },
      thumbnailGradient: GRADIENTS[idx % GRADIENTS.length],
    })),
    [liveHubSources],
  );

  const filteredCatalog = useMemo(() => {
    if (sourceFilter === 'ORG_ONLY') {
      const orgItems = streamCatalog.filter(s => s.isOrgOwned);
      return orgItems.length > 0 ? orgItems : streamCatalog;
    }
    if (sourceFilter === 'LIVEHUB_TV') {
      const hubItems = streamCatalog.filter(s => !s.isOrgOwned);
      return hubItems.length > 0 ? hubItems : streamCatalog;
    }
    return streamCatalog;
  }, [streamCatalog, sourceFilter]);

  const [selectedStreamId, setSelectedStreamId] = useState<string>(() => streamCatalog[0]?.id ?? '');
  const userPickedStreamRef = useRef(false);

  // Land on the org's own broadcast as soon as it arrives, unless the viewer chose something.
  useEffect(() => {
    if (userPickedStreamRef.current && streamCatalog.some(s => s.id === selectedStreamId)) return;
    const orgPlayable = streamCatalog.find(s => s.isOrgOwned && s.playback);
    if (orgPlayable && selectedStreamId !== orgPlayable.id) { setSelectedStreamId(orgPlayable.id); return; }
    if (!streamCatalog.some(s => s.id === selectedStreamId) && streamCatalog[0]) setSelectedStreamId(streamCatalog[0].id);
  }, [streamCatalog, selectedStreamId]);

  const activeStream = useMemo(
    () => streamCatalog.find(s => s.id === selectedStreamId) ?? streamCatalog[0] ?? NOTHING_ON_AIR,
    [streamCatalog, selectedStreamId],
  );
  const isLiveStream = activeStream.kind !== 'SERVICE_REPLAY';
  const isEmbed = activeStream.playback?.kind === 'embed';

  const [playerExpanded, setPlayerExpanded] = useState<boolean>(defaultPlayerExpanded);
  const [playing, setPlaying] = useState<boolean>(true);
  const [muted, setMuted] = useState<boolean>(true);
  const [miniState, setMiniState] = useState<'open' | 'minimized' | 'closed'>('open');
  useEffect(() => {
    if (compact) return;
    if (miniState === 'closed') setPlaying(true);
    setMiniState('open');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact]);
  const [panelMounted, setPanelMounted] = useState<boolean>(true);
  const isPhone = useLeafPhone();

  // ── Reading display (per viewer, this device) ──
  const [skinId, setSkinId] = useState<string>(() => {
    if (isLeafPhoneNow() && inSanctuaryAutoEngaged) return 'night';
    return readDisplay().skin || DEFAULT_VERSE_SKIN;
  });
  const [textSize, setTextSize] = useState<TextSizeId>(() => readDisplay().size || 'm');
  useEffect(() => { if (inSanctuaryAutoEngaged && isLeafPhoneNow()) setSkinId('night'); }, [inSanctuaryAutoEngaged]);
  const pickSkin = (id: string) => { setSkinId(id); writeDisplay({ skin: id, size: textSize }); };
  const pickSize = (id: TextSizeId) => { setTextSize(id); writeDisplay({ skin: skinId, size: id }); };
  const activeSkin = VERSE_SKINS.find(s => s.id === skinId) ?? VERSE_SKINS[0];
  const [translation, setTranslation] = useState<string>(() => (/catholic/i.test(org.denomination || '') ? 'douayrheims' : DEFAULT_TRANSLATION));

  // ── Playhead: the real media time; an embed (no access to its clock) counts time watched. ──
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [playheadSec, setPlayheadSec] = useState(0);
  const playheadRef = useRef(0);
  playheadRef.current = playheadSec;
  const onMediaTime = useCallback((t: number) => setPlayheadSec(Math.floor(t)), []);
  useEffect(() => { setPlayheadSec(Math.floor(activeStream.playback?.offsetSec || 0)); }, [activeStream.id, activeStream.playback?.offsetSec]);
  useEffect(() => {
    if (!playing || !isEmbed) return;
    const timer = window.setInterval(() => setPlayheadSec(p => p + 1), 1000);
    return () => window.clearInterval(timer);
  }, [playing, isEmbed]);
  const seekTo = (sec: number) => {
    if (videoEl && !isEmbed) { try { videoEl.currentTime = sec; } catch { /* live edge */ } }
    setPlayheadSec(Math.floor(sec));
  };

  // ── This source's watch session: passages + notes, in memory and in the notebook. ──
  const [session, setSession] = useState<WatchSession>(() => readWatchSession(org.id, activeStream.id, activeStream.title, activeStream.ministryChannelName));
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [pinned, setPinned] = useState<WatchPassage | null>(null);
  useEffect(() => {
    const s = readWatchSession(org.id, activeStream.id, activeStream.title, activeStream.ministryChannelName);
    sessionRef.current = s;
    setSession(s);
    setPinned(null);
    setPanelMounted(true);
  }, [org.id, activeStream.id, activeStream.title, activeStream.ministryChannelName]);
  useEffect(() => {
    if (!faith) return;
    void syncWatchSessions().then(() => {
      const cur = sessionRef.current;
      const s = readWatchSession(cur.orgId, cur.sourceId);
      sessionRef.current = s;
      setSession(s);
    }).catch(() => {});
  }, [faith]);

  const pushPassage = useCallback((p: WatchPassage) => {
    const next = addWatchPassage(sessionRef.current, p);
    if (next !== sessionRef.current) { sessionRef.current = next; setSession(next); }
  }, []);

  // ── Passages from the feed: speech heard in the stream… ──
  const [listenPref, setListenPref] = useState<boolean>(() => {
    try { const v = localStorage.getItem(scopedKey(LISTEN_KEY)); return v === null ? !isLeafPhoneNow() : v === '1'; } catch { return true; }
  });
  const toggleListen = () => {
    setListenPref(v => { try { localStorage.setItem(scopedKey(LISTEN_KEY), v ? '0' : '1'); } catch { /* */ } return !v; });
  };
  const hearsRefs = faithHearsReferences(faith);
  const listenOn = !!faith && hearsRefs && listenPref && !compact && playing && !!activeStream.playback && (isPhone || panelMounted);
  const onHeard = useCallback((hit: ListenerHit) => {
    if (faith === 'judaism' && hit.ref.book > 39) return; // not in the Tanakh
    pushPassage({ refId: hit.refId, label: hit.label, tc: playheadRef.current, at: Date.now(), source: 'heard', heard: hit.heard });
  }, [faith, pushPassage]);
  const listen = useFeedScripture(videoEl, listenOn, isEmbed, onHeard, activeStream.id);

  // …and the org's Stage team, for the org's own live service.
  const stageApplies = !!faith && hearsRefs && activeStream.kind === 'LIVE_SANCTUARY' && !!activeStream.isOrgOwned;
  const [kairosSession, setKairosSession] = useState<ScriptureSession | null>(null);
  useEffect(() => {
    if (!stageApplies) { setKairosSession(null); return; }
    const unsub = listenToSession(sessionIdFor(org.id), s => setKairosSession(s));
    return () => unsub();
  }, [org.id, stageApplies]);
  const stageCue = stageApplies && kairosSession?.isActive ? kairosSession.current : null;
  useEffect(() => {
    if (!stageCue?.refId) return;
    const ref = parseRefId(stageCue.refId);
    if (!ref || (faith === 'judaism' && ref.book > 39)) return;
    pushPassage({ refId: stageCue.refId, label: stageCue.label, tc: playheadRef.current, at: Date.now(), source: 'stage' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageCue?.refId, stageCue?.label]);
  const stageFollowing = stageApplies && !!kairosSession?.isActive;

  // What the panel shows: the viewer's own pick, else what the feed is on at this moment.
  const followed = passageAt(session, playheadSec, isLiveStream);
  const passage = pinned ?? followed;
  const { text, loading, error } = usePassageText(faith ?? 'christianity', faith ? passage : null, translation);

  const pickPassage = (refId: string, label: string) => {
    const p: WatchPassage = { refId, label, tc: playheadRef.current, at: Date.now(), source: 'picked' };
    pushPassage(p);
    setPinned(p);
  };
  const jumpToPassage = (p: WatchPassage) => {
    // A replay seeks to the moment; live stays live and the panel holds that passage.
    if (!isLiveStream && !isEmbed) { seekTo(p.tc); setPinned(null); }
    else setPinned(p);
  };
  const openStudy = onOpenFullLectio && passage && faith === 'christianity'
    ? () => { const r = parseRefId(passage.refId); if (r) onOpenFullLectio(r); }
    : undefined;

  // ── Notes ──
  const [noteDraft, setNoteDraft] = useState<string>('');
  const handleAddNote = () => {
    const trimmed = noteDraft.trim();
    if (!trimmed) return;
    const tc = playheadRef.current;
    const next = addWatchNote(sessionRef.current, {
      id: `note_${Date.now()}`, tc, refId: passage?.refId || '', label: passage?.label || '', text: trimmed, at: Date.now(),
    });
    sessionRef.current = next;
    setSession(next);
    // A note on a Bible verse also lands on that verse in the reader (and the account notebook).
    const ref = passage && faith === 'christianity' ? parseRefId(passage.refId) : null;
    if (ref) {
      const vKey = `${ref.book}:${ref.chapter}:${ref.verse ?? 1}`;
      const existing = verseNotes.read()[vKey];
      const line = `[${formatTC(tc)} · ${activeStream.title}] ${trimmed}`;
      verseNotes.write(vKey, existing ? `${existing}\n${line}` : line);
      if (activeStream.isOrgOwned && activeStream.kind === 'LIVE_SANCTUARY') {
        recordServiceNote({ verseKey: vKey, refId: passage!.refId, label: passage!.label, sessionId: sessionIdFor(org.id), serviceTitle: activeStream.title, programTC: tc });
      }
    }
    setNoteDraft('');
  };
  const deleteNote = (id: string) => {
    const next = removeWatchNote(sessionRef.current, id);
    sessionRef.current = next;
    setSession(next);
  };

  const selectStreamSource = (id: string) => {
    userPickedStreamRef.current = true;
    setSelectedStreamId(id);
    setPlayerExpanded(true);
    setPlaying(true);
  };

  const orgBroadcastCount = useMemo(() => streamCatalog.filter(s => s.isOrgOwned).length, [streamCatalog]);
  const liveHubCount = useMemo(() => streamCatalog.filter(s => !s.isOrgOwned).length, [streamCatalog]);

  const media = (
    <ReelloStageMedia
      playback={activeStream.playback}
      muted={muted}
      playing={playing}
      title={activeStream.title}
      onVideo={setVideoEl}
      onTime={onMediaTime}
    />
  );

  // ── Mini player (any page but the main one). Nothing on air → nothing floats. ──
  if (compact) {
    if (!activeStream.playback || miniState === 'closed') return null;
    const dock: React.CSSProperties = { position: 'fixed', right: 16, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)', zIndex: 60 };
    if (miniState === 'minimized') {
      return (
        <button
          type="button"
          onClick={() => setMiniState('open')}
          style={dock}
          className="flex items-center gap-2 pl-3 pr-4 h-10 rounded-full border shadow-2xl bg-[#18141F] border-white/15 text-white text-[12px] font-bold max-w-[260px]"
          title="Show the live player"
        >
          <span className="ev-live-dot shrink-0" />
          <span className="truncate">{activeStream.title}</span>
        </button>
      );
    }
    return (
      <div style={{ ...dock, width: 'min(340px, max(220px, 62vw))' }} className="rounded-2xl overflow-hidden border shadow-2xl bg-[#18141F] border-white/15" role="region" aria-label={`${org.name} live player`}>
        <div className="relative aspect-video bg-black" style={{ background: activeStream.thumbnailGradient }}>
          {media}
          <div className="absolute inset-x-0 bottom-0 z-10 p-2 flex items-center gap-1.5 bg-gradient-to-t from-black/80 to-transparent">
            <button onClick={() => setMuted(m => !m)} className="h-7 px-2 rounded-md bg-black/70 border border-white/20 flex items-center gap-1 text-white text-[11px] font-bold" title={muted ? 'Unmute stream' : 'Mute stream'}>
              {muted ? <><VolumeX size={13} /><span>Unmute</span></> : <Volume2 size={13} />}
            </button>
            <button onClick={() => setPlaying(p => !p)} className="w-7 h-7 rounded-md bg-black/70 border border-white/20 flex items-center justify-center text-white" title={playing ? 'Pause' : 'Play'}>
              {playing ? <Pause size={13} /> : <Play size={13} />}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1 px-3 py-2">
          <span className="ev-live-dot shrink-0" />
          <span className="flex-1 min-w-0 ml-1 text-[12px] font-bold text-white truncate">{activeStream.title}</span>
          {onExpand && (
            <button onClick={onExpand} className="w-7 h-7 rounded-md hover:bg-white/10 flex items-center justify-center text-white/75" title="Expand player"><Maximize2 size={13} /></button>
          )}
          <button onClick={() => setMiniState('minimized')} className="w-7 h-7 rounded-md hover:bg-white/10 flex items-center justify-center text-white/75" title="Minimize"><Minimize2 size={13} /></button>
          <button onClick={() => { setMiniState('closed'); setPlaying(false); }} className="w-7 h-7 rounded-md hover:bg-white/10 flex items-center justify-center text-white/75" title="Close player"><X size={13} /></button>
        </div>
      </div>
    );
  }

  const nothingLive = (
    <div className="rounded-[20px] px-5 py-4 text-[14px]" style={{ background: EV.panel, color: EV.muted }}>
      Nothing is live right now.
    </div>
  );

  // ── Phone ──
  if (isPhone) {
    if (!activeStream.playback) return nothingLive;
    if (!faith) {
      // No scripture for this org: just the player.
      return (
        <div className="relative rounded-[20px] overflow-hidden aspect-video bg-black" style={{ background: activeStream.thumbnailGradient }}>
          {media}
          <button onClick={() => setMuted(m => !m)} className="absolute right-3 bottom-3 z-10 h-9 px-3 rounded-full bg-black/70 text-white text-[12px] font-semibold flex items-center gap-1.5">
            {muted ? <><VolumeX size={14} /> Unmute</> : <Volume2 size={14} />}
          </button>
        </div>
      );
    }
    const idx = passage ? session.passages.findIndex(p => p.refId === passage.refId && p.tc === passage.tc) : -1;
    const calledN = Number(text?.lines.find(l => l.id === text.called)?.n) || 1;
    return (
      <LeafPlayer
        media={media}
        mediaIsEmbed={isEmbed}
        background={activeStream.thumbnailGradient}
        title={activeStream.title}
        isLive={isLiveStream}
        muted={muted}
        onToggleMute={() => setMuted(m => !m)}
        label={passage?.label || 'Nothing read yet'}
        verse={calledN}
        excerpt={passage?.heard || ''}
        verses={(text?.lines || []).map(l => ({ verse: Number(l.n), text: l.text }))}
        loading={loading}
        translation={faith === 'christianity' ? translation : scriptureName}
        translations={faith === 'christianity' ? TRANSLATIONS.slice(0, 6) : []}
        onTranslation={setTranslation}
        skin={activeSkin}
        skins={VERSE_SKINS}
        onSkin={pickSkin}
        sources={streamCatalog.map(s => ({ id: s.id, title: s.title, channel: s.ministryChannelName, live: s.kind !== 'SERVICE_REPLAY' }))}
        activeSourceId={activeStream.id}
        onPickSource={selectStreamSource}
        onOpenLiveTv={onOpenOnAir && activeStream.onAirItem ? () => onOpenOnAir(activeStream.onAirItem!) : undefined}
        inSanctuary={inSanctuaryAutoEngaged}
        notes={session.notes.map(n => ({ id: n.id, timecodeSec: n.tc, verseLabel: n.label, text: n.text }))}
        noteDraft={noteDraft}
        onNoteDraft={setNoteDraft}
        onAddNote={handleAddNote}
        onJumpTo={seekTo}
        playheadSec={playheadSec}
        onStepCue={
          session.passages.length > 1 && idx >= 0
            ? dir => { const next = session.passages[idx + dir]; if (next) jumpToPassage(next); }
            : undefined
        }
        onOpenStudy={openStudy}
      />
    );
  }

  // ── Desktop ──
  if (streamCatalog.length === 0) return nothingLive;
  const showPanel = !!faith && panelMounted;

  return (
    <div className="space-y-5">
      {/* ── 1. Sources ── */}
      <div className="rounded-3xl p-5 border" style={{ background: EV.panel, borderColor: EV.line }}>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="inline-flex items-center gap-2 ev-title text-lg text-white">
              <span className="ev-live-dot" />
              {faith ? 'Watch' : 'Live & on demand'}
            </span>
            <span className="text-[13px] hidden sm:inline" style={{ color: EV.muted }}>
              {faith ? `${org.name}’s broadcasts, with the ${scriptureName} on the side` : `${org.name}’s broadcasts`}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {liveHubCount > 0 && orgBroadcastCount > 0 && (
              <div className="flex items-center gap-1 bg-black/40 p-1 rounded-full border border-white/10">
                {([
                  ['ALL', `All (${streamCatalog.length})`],
                  ['ORG_ONLY', `${org.name} (${orgBroadcastCount})`],
                  ['LIVEHUB_TV', `LiveHub TV+ (${liveHubCount})`],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSourceFilter(key)}
                    className={`px-3 py-1 rounded-full text-[12px] font-semibold transition-all ${sourceFilter === key ? 'bg-white text-black' : 'text-white/65 hover:text-white'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {inSanctuaryAutoEngaged && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 text-[12px] font-semibold">
                <Navigation size={12} />
                <span>In the sanctuary</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setPlayerExpanded(v => !v)}
              className="px-3 py-1 rounded-full text-[12px] font-semibold border flex items-center gap-1.5 text-white"
              style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.16)' }}
            >
              {playerExpanded ? <Pause size={11} /> : <Play size={11} />}
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
                className={`text-left rounded-2xl p-3.5 border transition-all flex flex-col justify-between relative overflow-hidden group ${isSelected && playerExpanded ? 'ring-2 ring-white/80' : 'hover:border-white/30'}`}
                style={{ background: item.thumbnailGradient, borderColor: isSelected && playerExpanded ? 'rgba(255,255,255,0.8)' : 'rgba(216, 210, 226,0.18)' }}
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1 ${item.isOrgOwned ? 'bg-[#D40055] text-white' : 'bg-black/60 text-white/85 border border-white/20'}`}>
                    {item.kind === 'LIVE_SANCTUARY' ? <Radio size={10} /> : item.kind === 'MINISTRY_TV_CHANNEL' ? <Tv size={10} /> : <Clock size={10} />}
                    {item.badgeText}
                  </span>
                  {typeof item.viewerCount === 'number' && item.viewerCount > 0 && (
                    <span className="text-[11px] tabular-nums text-white/80 bg-black/45 px-2 py-0.5 rounded-full">{item.viewerCount} watching</span>
                  )}
                </div>
                <div>
                  <div className="text-[12px] font-semibold text-white/70 truncate">{item.ministryChannelName}</div>
                  <div className="text-sm font-bold text-white leading-snug line-clamp-2 mt-0.5">{item.title}</div>
                  <div className="text-[12px] text-white/70 mt-1 flex items-center justify-between">
                    <span className="truncate">{item.speaker}</span>
                    <span className="inline-flex items-center gap-0.5 text-white font-semibold group-hover:translate-x-0.5 transition-transform">
                      {isSelected && playerExpanded ? 'Watching' : 'Watch'} <ChevronRight size={12} />
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 2. Player + scripture ── */}
      {playerExpanded && (
        <div className="rounded-3xl border overflow-hidden" style={{ background: EV.chrome, borderColor: EV.line }}>
          <div className="px-5 py-3 border-b flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: EV.line }}>
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-[15px] font-semibold text-white truncate max-w-md" style={{ fontFamily: EV_FONT.display }}>{activeStream.title}</span>
              {streamCatalog.length > 1 && (
                <select
                  aria-label="Switch source"
                  value={activeStream.id}
                  onChange={e => selectStreamSource(e.target.value)}
                  className="h-8 rounded-full bg-white/[0.06] border border-white/15 text-[12px] font-semibold text-white px-3 outline-none focus:border-white/40 max-w-[260px]"
                >
                  {streamCatalog.map(s => (
                    <option key={s.id} value={s.id} className="bg-[#18141F] text-white">
                      {s.isOrgOwned ? `${org.name}: ` : 'LiveHub TV+: '}{s.title}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex items-center gap-2">
              {onOpenOnAir && activeStream.onAirItem && (
                <button
                  type="button"
                  onClick={() => onOpenOnAir(activeStream.onAirItem!)}
                  className="h-8 px-3 rounded-full text-[12px] font-semibold border border-white/15 text-white/85 hover:bg-white/10 flex items-center gap-1.5"
                >
                  <Maximize2 size={12} /> Open in Live TV+
                </button>
              )}
              {faith && (
                <button
                  onClick={() => setPanelMounted(v => !v)}
                  className="h-8 px-3 rounded-full text-[12px] font-semibold border flex items-center gap-1.5"
                  style={panelMounted
                    ? { background: 'rgba(255,255,255,0.10)', borderColor: 'rgba(255,255,255,0.22)', color: '#fff' }
                    : { background: 'transparent', borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)' }}
                >
                  <BookOpen size={13} />
                  <span>{panelMounted ? `Hide ${scriptureName}` : `Show ${scriptureName}`}</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12">
            {/* Video + notes */}
            <div className={`${showPanel ? 'lg:col-span-7' : 'lg:col-span-12'} p-5 flex flex-col gap-4 border-b lg:border-b-0 ${showPanel ? 'lg:border-r' : ''}`} style={{ borderColor: EV.line }}>
              <div className="relative rounded-2xl overflow-hidden border border-white/10 aspect-video flex flex-col justify-between p-4 bg-black" style={{ background: activeStream.thumbnailGradient }}>
                {media}
                <div className="flex items-center justify-between gap-2 z-10 pointer-events-none">
                  <span className="px-2.5 py-1 rounded-full text-[12px] font-semibold bg-black/65 text-white flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${isLiveStream ? 'bg-[#FF8C00] animate-pulse' : 'bg-white/70'}`} />
                    {isLiveStream ? 'Live' : 'Replay'} <span className="tabular-nums text-white/70">· {formatTC(playheadSec)}</span>
                  </span>
                  <div className="flex items-center gap-1.5 pointer-events-auto">
                    <button onClick={() => setMuted(m => !m)} className="px-3 h-8 rounded-full bg-black/65 hover:bg-black/85 flex items-center gap-1.5 text-white text-[12px] font-semibold" title={muted ? 'Unmute stream' : 'Mute stream'}>
                      {muted ? <><VolumeX size={14} /><span>Unmute</span></> : <Volume2 size={14} />}
                    </button>
                    <button onClick={() => setPlaying(p => !p)} className="w-8 h-8 rounded-full bg-black/65 hover:bg-black/85 flex items-center justify-center text-white" title={playing ? 'Pause' : 'Play'}>
                      {playing ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                  </div>
                </div>
                {/* With the panel hidden, the passage being read rides as a quiet lower third. */}
                {faith && !panelMounted && passage && (
                  <button
                    onClick={() => setPanelMounted(true)}
                    className="z-10 self-start max-w-[80%] text-left rounded-xl px-3.5 py-2.5 bg-black/70 backdrop-blur-md"
                  >
                    <div className="text-[12px] font-semibold" style={{ color: EV.gold }}>{passage.label}</div>
                    <div className="text-[13px] text-white/85 line-clamp-1" style={{ fontFamily: EV_FONT.scripture }}>
                      {text?.lines.find(l => l.id === text.called)?.text || ''}
                    </div>
                  </button>
                )}
              </div>

              {faith && (
                <div className="rounded-2xl p-4 border space-y-3" style={{ background: EV.panel, borderColor: EV.line }}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[13px] font-semibold text-white">
                      <MessageSquarePlus size={15} style={{ color: EV.violetText }} />
                      <span>Your notes on this {isLiveStream ? 'stream' : 'replay'}</span>
                    </div>
                    <span className="text-[12px] tabular-nums" style={{ color: EV.muted }}>
                      {formatTC(playheadSec)}{passage ? ` · ${passage.label}` : ''}
                    </span>
                  </div>
                  <form className="flex gap-2" onSubmit={e => { e.preventDefault(); handleAddNote(); }}>
                    <input
                      type="text"
                      value={noteDraft}
                      onChange={e => setNoteDraft(e.target.value)}
                      placeholder={passage ? `A thought on ${passage.label}…` : 'A thought, stamped to this moment…'}
                      className="flex-1 h-10 px-3.5 rounded-full bg-white/[0.04] border border-white/12 text-[14px] text-white placeholder:text-white/40 outline-none focus:border-white/35"
                    />
                    <button type="submit" disabled={!noteDraft.trim()} className="px-4 h-10 rounded-full text-[13px] font-semibold text-white flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40" style={{ background: '#6D3FD6' }}>
                      <Plus size={14} /> Add note
                    </button>
                  </form>
                  {session.notes.length > 0 ? (
                    <ul className="space-y-1.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                      {session.notes.map(n => (
                        <li key={n.id} className="group flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.04]">
                          <button
                            onClick={() => seekTo(n.tc)}
                            className="shrink-0 mt-0.5 px-2 h-6 rounded-full text-[11px] font-semibold tabular-nums bg-white/[0.06] text-white/80 hover:bg-white/15"
                            title={isEmbed ? 'Stamped at this moment' : 'Jump to this moment'}
                          >
                            {formatTC(n.tc)}
                          </button>
                          <div className="flex-1 min-w-0">
                            {n.label && <div className="text-[12px] font-semibold" style={{ color: EV.gold }}>{n.label}</div>}
                            <p className="text-[14px] text-white/85 leading-snug">{n.text}</p>
                          </div>
                          <button onClick={() => deleteNote(n.id)} className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10" title="Delete note">
                            <Trash2 size={13} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[13px]" style={{ color: EV.muted }}>Notes you add here stay with this {isLiveStream ? 'stream' : 'replay'} and in your notebook.</p>
                  )}
                </div>
              )}
            </div>

            {showPanel && faith && (
              <div className="lg:col-span-5">
                <VersePanel
                  faith={faith}
                  passage={passage}
                  passages={session.passages}
                  text={text}
                  loading={loading}
                  error={error}
                  isLive={isLiveStream}
                  following={!pinned}
                  onFollow={() => setPinned(null)}
                  onPick={pickPassage}
                  onJump={jumpToPassage}
                  listen={listen}
                  listenEnabled={listenPref}
                  onToggleListen={hearsRefs ? toggleListen : undefined}
                  stageFollowing={stageFollowing}
                  translation={translation}
                  onTranslation={setTranslation}
                  skin={activeSkin}
                  onSkin={pickSkin}
                  textSize={TEXT_SIZES.some(s => s.id === textSize) ? textSize : 'm'}
                  onTextSize={pickSize}
                  onOpenStudy={openStudy}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RelloChurchViewer;
