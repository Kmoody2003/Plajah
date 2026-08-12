import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Hls from 'hls.js';
import {
  ArrowLeft, Radio, Tv, X, Send, User, Play, Pause, SkipForward, SkipBack,
  Volume2, VolumeX, MessageCircle, Info, Wifi, Users, Maximize2,
} from 'lucide-react';
import { LiveFeed, ChatMessage, FastChannelSlot } from '../types';
import { useViewport } from '../hooks/useViewport';
import { useBroadcastDirectory, FastChannelListing } from '../hooks/useBroadcastDirectory';
import {
  auth, listenToMessages, sendMessage, ensureLiveChatRoom,
  fetchFastChannelVideos, fetchFastChannelSchedule,
} from '../services/backendService';
import { resolveSlotMedia, slotIsPlayable, slotsFromVideos, activeDaySlots, dayAnchoredPosition } from '../services/fastChannelTimeline';
import { hlsTuning, capLevelsToPanel } from '../services/hlsTuning';

// ─────────────────────────────────────────────────────────────────────────
// MobileLiveHub — a phone-first surface for everything live on Plajah: user
// live streams (chat-first) and FAST channels (vertical: small viewer on top,
// channel guide below). Rotating the phone to landscape auto-expands the video
// to full screen; rotating back restores the layout. Built on the same
// broadcast directory the Social hub uses, and the same deterministic FAST
// timeline the desktop player + EPG use — so what airs here matches everywhere.
// ─────────────────────────────────────────────────────────────────────────

const GRAD = 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)';

function isHls(url: string) { return (url || '').toLowerCase().includes('.m3u8'); }
function isEmbeddable(url: string) {
  const l = (url || '').toLowerCase();
  return l.includes('youtube.com') || l.includes('youtu.be') || l.includes('twitch.tv') || l.includes('vimeo.com') || l.includes('archive.org');
}
function autoplayEmbed(url: string, muted: boolean): string {
  try {
    const u = new URL(url);
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      u.searchParams.set('autoplay', '1'); u.searchParams.set('mute', muted ? '1' : '0'); u.searchParams.set('playsinline', '1');
    } else if (url.includes('twitch.tv')) {
      u.searchParams.set('autoplay', 'true'); u.searchParams.set('muted', muted ? 'true' : 'false'); u.searchParams.set('parent', window.location.hostname);
    } else {
      u.searchParams.set('autoplay', '1'); u.searchParams.set('mute', muted ? '1' : '0');
    }
    return u.toString();
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}autoplay=1&mute=${muted ? '1' : '0'}`;
  }
}

// ── A compact, self-contained live chat keyed to live_chat_<feedId> ──────────
const LiveChatPanel: React.FC<{ feedId: string; title: string; coverUrl?: string; ownerName?: string }> = ({ feedId, title, coverUrl, ownerName }) => {
  const roomId = `live_chat_${feedId}`;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const me = auth.currentUser;

  useEffect(() => {
    ensureLiveChatRoom(roomId, { name: title, coverUrl, mediaArtist: ownerName }).catch(() => {});
    const unsub = listenToMessages(roomId, setMessages);
    return () => { try { (unsub as any)?.(); } catch { /* */ } };
  }, [roomId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const send = async () => {
    const t = text.trim();
    if (!t || !me || sending) return;
    setSending(true);
    setText('');
    try {
      await sendMessage(roomId, {
        senderId: me.uid,
        senderName: me.displayName || 'Anonymous',
        senderPhoto: me.photoURL || '',
        text: t,
        type: 'TEXT',
      });
    } catch { setText(t); }
    finally { setSending(false); }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center gap-2 opacity-30 py-10">
            <MessageCircle size={28} />
            <p className="text-[10px] font-black uppercase tracking-widest">Be the first to chat</p>
          </div>
        )}
        {messages.map(m => {
          const own = m.senderId === me?.uid;
          if (m.type === 'SYSTEM' || m.type === 'ACTION') {
            return <p key={m.id} className="text-center text-[9px] font-bold uppercase tracking-widest text-white/30">{m.text}</p>;
          }
          return (
            <div key={m.id} className={`flex items-start gap-2 ${own ? 'flex-row-reverse' : ''}`}>
              <div className="w-6 h-6 rounded-full bg-white/10 overflow-hidden shrink-0 mt-0.5">
                {m.senderPhoto ? <img src={m.senderPhoto} className="w-full h-full object-cover" alt="" /> : <User size={12} className="m-1.5 text-white/30" />}
              </div>
              <div className={`max-w-[78%] ${own ? 'items-end text-right' : ''} flex flex-col`}>
                <span className="text-[8px] font-black uppercase tracking-widest text-white/35 px-1">{own ? 'You' : m.senderName}</span>
                <div className={`px-3 py-1.5 rounded-2xl text-[13px] leading-snug break-words ${own ? 'text-white' : 'bg-white/8 text-white/90'}`} style={own ? { background: GRAD } : {}}>
                  {m.text}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="shrink-0 flex items-center gap-2 px-3 py-3 border-t border-white/10 bg-black/40" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send(); }}
          placeholder={me ? 'Say something…' : 'Sign in to chat'}
          disabled={!me}
          className="flex-1 bg-white/8 rounded-full px-4 py-2.5 text-[13px] text-white placeholder-white/25 outline-none focus:ring-2 ring-white/15"
        />
        <button onClick={send} disabled={!text.trim() || sending} className="p-2.5 rounded-full text-white disabled:opacity-30 transition-all active:scale-95" style={{ background: GRAD }}>
          <Send size={16} />
        </button>
      </div>
    </div>
  );
};

// ── Live stream viewer — video pinned top, chat/about below; landscape fills ──
const MobileLiveViewer: React.FC<{ feed: LiveFeed; onClose: () => void }> = ({ feed, onClose }) => {
  const vp = useViewport();
  const landscape = vp.orientation === 'landscape';
  const [tab, setTab] = useState<'CHAT' | 'ABOUT'>('CHAT');
  const [muted, setMuted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const url = feed.url || '';
  const hls = isHls(url);
  const embed = !hls && isEmbeddable(url);

  useEffect(() => {
    if (!hls) return;
    const v = videoRef.current;
    if (!v) return;
    if (v.canPlayType('application/vnd.apple.mpegurl')) { v.src = url; v.play().catch(() => {}); }
    else if (Hls.isSupported()) {
      const h = new Hls(hlsTuning()); hlsRef.current = h;
      h.loadSource(url); h.attachMedia(v);
      h.on(Hls.Events.MANIFEST_PARSED, () => { capLevelsToPanel(h as any); v.play().catch(() => {}); });
    } else { v.src = url; v.play().catch(() => {}); }
    return () => { if (hlsRef.current) { try { hlsRef.current.destroy(); } catch { /* */ } hlsRef.current = null; } };
  }, [url, hls]);

  const Video = (
    <div className={`relative bg-black w-full ${landscape ? 'h-full' : 'aspect-video'}`}>
      {embed ? (
        <iframe src={autoplayEmbed(url, muted)} className="absolute inset-0 w-full h-full border-none" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title={feed.title} />
      ) : hls ? (
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-contain bg-black" autoPlay playsInline muted={muted} controls={landscape} />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/30">
          <Tv size={40} /><p className="text-[10px] font-black uppercase tracking-widest">Stream unavailable</p>
        </div>
      )}
      {/* Live badge */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 px-3 py-1 bg-red-600 rounded-full text-white text-[9px] font-black uppercase tracking-widest shadow-lg z-10">
        <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" /> Live
      </div>
      {/* Controls */}
      <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
        {!embed && (
          <button onClick={() => setMuted(m => !m)} className="p-2 rounded-full bg-black/50 backdrop-blur text-white">
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
        )}
        <button onClick={onClose} className="p-2 rounded-full bg-black/50 backdrop-blur text-white"><X size={16} /></button>
      </div>
    </div>
  );

  if (landscape) {
    return <div className="fixed inset-0 z-[300] bg-black">{Video}</div>;
  }

  return (
    <div className="fixed inset-0 z-[300] bg-[#0a0a0a] flex flex-col">
      {Video}
      {/* Title */}
      <div className="shrink-0 px-4 pt-3 pb-2 flex items-center gap-3 border-b border-white/8">
        <div className="w-9 h-9 rounded-full bg-white/10 overflow-hidden shrink-0">
          {feed.ownerPhoto ? <img src={feed.ownerPhoto} className="w-full h-full object-cover" alt="" /> : <User size={16} className="m-2.5 text-white/30" />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-black text-white truncate leading-tight">{feed.title}</h3>
          <p className="text-[9px] font-black uppercase tracking-widest text-small-orange truncate">{feed.ownerName}</p>
        </div>
        <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 text-white/40 text-[9px] font-black uppercase tracking-widest">
          <Users size={11} /> Live
        </div>
      </div>
      {/* Tabs */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2">
        {(['CHAT', 'ABOUT'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${tab === t ? 'text-white' : 'bg-white/5 text-white/40'}`} style={tab === t ? { background: GRAD } : {}}>
            {t === 'CHAT' ? <MessageCircle size={12} /> : <Info size={12} />}{t === 'CHAT' ? 'Live Chat' : 'About'}
          </button>
        ))}
        <span className="ml-auto text-[8px] font-black uppercase tracking-widest text-white/25 flex items-center gap-1"><Maximize2 size={10} /> Rotate for full screen</span>
      </div>
      {/* Body */}
      <div className="flex-1 min-h-0">
        {tab === 'CHAT'
          ? <LiveChatPanel feedId={feed.id || feed.streamId || 'global'} title={feed.title} coverUrl={feed.ownerPhoto} ownerName={feed.ownerName} />
          : (
            <div className="px-5 py-4 overflow-y-auto h-full">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Now streaming</p>
              <h4 className="text-lg font-black text-white mb-1">{feed.title}</h4>
              <p className="text-white/50 text-sm">{feed.ownerName} is live right now. Join the chat and interact in real time.</p>
            </div>
          )}
      </div>
    </div>
  );
};

// ── FAST channel viewer — small viewer on top, guide below; landscape fills ──
const MobileFastViewer: React.FC<{ listing: FastChannelListing; onClose: () => void }> = ({ listing, onClose }) => {
  const vp = useViewport();
  const landscape = vp.orientation === 'landscape';
  const profile = listing.profile;
  const [slots, setSlots] = useState<FastChannelSlot[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const joinOffsetRef = useRef(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [vids, schedule] = await Promise.all([
        fetchFastChannelVideos(profile.uid).catch(() => []),
        fetchFastChannelSchedule(profile.uid).catch(() => null),
      ]);
      if (!alive) return;
      const daySlots = activeDaySlots(schedule, Date.now());
      let built: FastChannelSlot[] = daySlots.length
        ? [...daySlots].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        : slotsFromVideos(vids as any);
      built = built.filter(slotIsPlayable);
      if (built.length) {
        // Terrestrial join: anchor to the time of day (local midnight), seek mid-programme.
        const { index: i, offsetSec } = dayAnchoredPosition(built, Date.now());
        joinOffsetRef.current = offsetSec;
        setSlots(built); setIndex(i);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [profile.uid]);

  const slot = slots[index];
  const media = slot ? resolveSlotMedia(slot) : null;
  const hlsSrc = media?.kind === 'MEDIA'
    ? (media.muxPlaybackId ? `https://stream.mux.com/${media.muxPlaybackId}.m3u8` : (media.isHls ? media.url : undefined))
    : undefined;
  const mp4Src = media?.kind === 'MEDIA' && !hlsSrc ? media.url : undefined;

  const advance = useCallback(() => { setIndex(p => (slots.length ? (p + 1) % slots.length : 0)); setPaused(false); }, [slots.length]);
  const goBack = useCallback(() => { setIndex(p => (slots.length ? (p - 1 + slots.length) % slots.length : 0)); setPaused(false); }, [slots.length]);

  // attach media for MEDIA slots
  useEffect(() => {
    if (!media || media.kind !== 'MEDIA') return;
    const v = videoRef.current;
    if (!v) return;
    if (hlsSrc) {
      if (v.canPlayType('application/vnd.apple.mpegurl')) { v.src = hlsSrc; v.play().catch(() => {}); }
      else if (Hls.isSupported()) {
        const h = new Hls(hlsTuning()); hlsRef.current = h;
        h.loadSource(hlsSrc); h.attachMedia(v);
        h.on(Hls.Events.MANIFEST_PARSED, () => { capLevelsToPanel(h as any); v.play().catch(() => {}); });
      } else { v.src = hlsSrc; v.play().catch(() => {}); }
    } else if (mp4Src) { v.src = mp4Src; v.load?.(); v.play().catch(() => {}); }
    return () => { if (hlsRef.current) { try { hlsRef.current.destroy(); } catch { /* */ } hlsRef.current = null; } };
  }, [index, hlsSrc, mp4Src]);

  // advance driver — MEDIA advances on `ended`, but a timer guarantees the loop never stalls
  useEffect(() => {
    if (!media || paused) return;
    const off = joinOffsetRef.current || 0;
    const remaining = Math.max(1, media.durationSec - off);
    if (media.kind !== 'MEDIA') joinOffsetRef.current = 0;
    const ms = (media.kind === 'MEDIA' ? remaining + 5 : remaining) * 1000;
    const t = setTimeout(advance, ms);
    return () => clearTimeout(t);
  }, [index, media?.kind, media?.durationSec, paused, advance]);

  const channelName = listing.name || (profile.displayName ? `${profile.displayName}'s Channel` : 'FAST Channel');

  // guide — the real content slots (skip bumpers/ads)
  const guide = useMemo(() => slots
    .map((s, i) => ({ slot: s, i }))
    .filter(({ slot }) => slot.type === 'VIDEO' || slot.type === 'PUBLIC_DOMAIN' || slot.type === 'LIVE_INTERRUPT'), [slots]);

  const Video = (
    <div className={`relative bg-black w-full ${landscape ? 'h-full' : 'aspect-video'}`}>
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center"><div className="w-10 h-10 border-2 border-white/10 border-t-white rounded-full animate-spin" /></div>
      ) : media?.kind === 'AD' ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-[#1a0033] via-black to-[#33001a]">
          {profile.photoURL && <img src={profile.photoURL} className="w-14 h-14 rounded-2xl object-cover border border-white/15" alt="" />}
          <p className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40">We'll be right back</p>
        </div>
      ) : media?.kind === 'LIVE' ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/30"><Wifi size={36} /><p className="text-[10px] font-black uppercase tracking-widest">Live programme</p></div>
      ) : (
        <video ref={videoRef} key={`fast-${index}`} className="absolute inset-0 w-full h-full object-contain bg-black" autoPlay playsInline muted={muted} controls={landscape}
          onLoadedMetadata={e => { const el = e.currentTarget; if (joinOffsetRef.current > 0 && joinOffsetRef.current < el.duration - 2) { try { el.currentTime = joinOffsetRef.current; } catch { /* */ } } joinOffsetRef.current = 0; }}
          onEnded={advance} onPlay={() => setPaused(false)} onPause={() => setPaused(true)} />
      )}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 px-3 py-1 bg-red-600 rounded-full text-white text-[9px] font-black uppercase tracking-widest shadow-lg z-10">
        <Tv size={11} /> FAST
      </div>
      <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
        <button onClick={() => setMuted(m => !m)} className="p-2 rounded-full bg-black/50 backdrop-blur text-white">{muted ? <VolumeX size={15} /> : <Volume2 size={15} />}</button>
        <button onClick={onClose} className="p-2 rounded-full bg-black/50 backdrop-blur text-white"><X size={16} /></button>
      </div>
    </div>
  );

  if (landscape) return <div className="fixed inset-0 z-[300] bg-black">{Video}</div>;

  return (
    <div className="fixed inset-0 z-[300] bg-[#0a0a0a] flex flex-col">
      {Video}
      {/* Now playing + transport */}
      <div className="shrink-0 px-4 pt-3 pb-3 border-b border-white/8">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-white/10 overflow-hidden shrink-0">
            {profile.photoURL ? <img src={profile.photoURL} className="w-full h-full object-cover" alt="" /> : <Tv size={16} className="m-2.5 text-white/30" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/35">Now playing</p>
            <h3 className="text-[13px] font-black text-white truncate leading-tight">{media?.title || channelName}</h3>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={goBack} className="p-2 rounded-full bg-white/8 text-white"><SkipBack size={15} /></button>
            <button onClick={() => { const v = videoRef.current; if (v) (paused ? v.play() : v.pause()); }} className="p-2.5 rounded-full text-white" style={{ background: GRAD }}>{paused ? <Play size={15} fill="white" /> : <Pause size={15} />}</button>
            <button onClick={advance} className="p-2 rounded-full bg-white/8 text-white"><SkipForward size={15} /></button>
          </div>
        </div>
      </div>
      {/* Guide */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-4 py-2 flex items-center gap-2 sticky top-0 bg-[#0a0a0a] z-10">
          <Radio size={13} className="text-small-orange" />
          <h4 className="text-[10px] font-black uppercase tracking-widest text-white">{channelName} · Guide</h4>
        </div>
        {guide.map(({ slot, i }) => {
          const m = resolveSlotMedia(slot);
          const current = i === index;
          const past = i < index;
          return (
            <button key={slot.id} onClick={() => { joinOffsetRef.current = 0; setIndex(i); }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left border-b border-white/5 transition-colors ${current ? 'bg-white/10' : 'active:bg-white/5'} ${past ? 'opacity-40' : ''}`}>
              <div className="relative w-16 h-10 rounded-lg overflow-hidden shrink-0 bg-white/5">
                {m.thumbnail ? <img src={m.thumbnail} className="w-full h-full object-cover" alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  : m.muxPlaybackId ? <img src={`https://image.mux.com/${m.muxPlaybackId}/thumbnail.jpg?width=128&time=5`} className="w-full h-full object-cover" alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  : <div className="w-full h-full flex items-center justify-center"><Tv size={14} className="text-white/20" /></div>}
                {current && <div className="absolute inset-0 flex items-center justify-center bg-black/40"><Play size={12} className="text-white" fill="white" /></div>}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-[11px] font-black uppercase tracking-tight truncate ${current ? 'text-white' : 'text-white/60'}`}>{m.title}</p>
                {current && <span className="text-[8px] font-black uppercase tracking-widest text-red-400 flex items-center gap-1 mt-0.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> On now</span>}
                {slot.type === 'LIVE_INTERRUPT' && <span className="text-[8px] font-black uppercase tracking-widest text-red-400/70">Live programme</span>}
              </div>
            </button>
          );
        })}
        {!loading && guide.length === 0 && (
          <div className="py-16 flex flex-col items-center gap-3 opacity-30"><Tv size={32} /><p className="text-[10px] font-black uppercase tracking-widest">No programmes scheduled</p></div>
        )}
      </div>
    </div>
  );
};

// ── The hub ──────────────────────────────────────────────────────────────────
interface MobileLiveHubProps {
  onBack: () => void;
  uid: string | null | undefined;
}

const MobileLiveHub: React.FC<MobileLiveHubProps> = ({ onBack, uid }) => {
  const [tab, setTab] = useState<'LIVE' | 'CHANNELS'>('LIVE');
  const [viewFeed, setViewFeed] = useState<LiveFeed | null>(null);
  const [viewChannel, setViewChannel] = useState<FastChannelListing | null>(null);
  const { liveStreams, fastChannels, followingIds, loading } = useBroadcastDirectory(uid);

  const followedLive = liveStreams.filter(f => followingIds.has(f.ownerId));
  const otherLive = liveStreams.filter(f => !followingIds.has(f.ownerId));

  return (
    <div className="w-full h-full flex flex-col bg-[#0a0a0a]">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 pt-4 pb-3" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <button onClick={onBack} className="p-2.5 rounded-full bg-white/5 text-white active:scale-95"><ArrowLeft size={20} /></button>
        <div className="min-w-0">
          <h1 className="text-xl font-black uppercase tracking-tighter text-white italic leading-none">Live Hub</h1>
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30">Streams & channels</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-600/15 text-red-400 text-[9px] font-black uppercase tracking-widest">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> {liveStreams.length} Live
        </div>
      </div>

      {/* Segmented tabs */}
      <div className="shrink-0 flex items-center gap-2 px-4 pb-3">
        {(['LIVE', 'CHANNELS'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${tab === t ? 'text-white' : 'bg-white/5 text-white/40'}`} style={tab === t ? { background: GRAD } : {}}>
            {t === 'LIVE' ? <Radio size={14} /> : <Tv size={14} />}{t === 'LIVE' ? 'Live Streams' : 'Channels'}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 pb-28">
        {loading && (
          <div className="py-24 flex flex-col items-center gap-4 opacity-40">
            <div className="w-10 h-10 border-2 border-white/10 border-t-white rounded-full animate-spin" />
            <p className="text-[10px] font-black uppercase tracking-widest">Tuning in…</p>
          </div>
        )}

        {!loading && tab === 'LIVE' && (
          <div className="space-y-6">
            {followedLive.length > 0 && (
              <section>
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-small-orange mb-2 px-1">From people you follow</p>
                <div className="space-y-3">{followedLive.map(f => <LiveRow key={f.id} feed={f} onOpen={() => setViewFeed(f)} />)}</div>
              </section>
            )}
            <section>
              {followedLive.length > 0 && <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 mb-2 px-1">More live now</p>}
              <div className="space-y-3">{otherLive.map(f => <LiveRow key={f.id} feed={f} onOpen={() => setViewFeed(f)} />)}</div>
            </section>
            {liveStreams.length === 0 && <EmptyState icon={<Radio size={40} />} label="No one is live right now" />}
          </div>
        )}

        {!loading && tab === 'CHANNELS' && (
          <div className="grid grid-cols-2 gap-3">
            {fastChannels.map(c => (
              <button key={c.ownerId} onClick={() => setViewChannel(c)} className="text-left rounded-2xl overflow-hidden bg-white/5 border border-white/8 active:scale-[0.98] transition-transform">
                <div className="relative aspect-video bg-black">
                  {c.logoUrl || c.profile?.photoURL ? <img src={c.logoUrl || c.profile?.photoURL} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center"><Tv size={28} className="text-white/15" /></div>}
                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-red-600 rounded-full text-white text-[8px] font-black uppercase tracking-widest flex items-center gap-1"><Tv size={9} /> FAST</div>
                  {typeof c.number === 'number' && <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/70 rounded text-white text-[9px] font-mono">CH {c.number}</div>}
                </div>
                <div className="p-2.5">
                  <p className="text-[11px] font-black text-white truncate leading-tight">{c.name}</p>
                  {c.category && <p className="text-[8px] font-black uppercase tracking-widest text-white/30 mt-0.5 truncate">{c.category}</p>}
                </div>
              </button>
            ))}
            {fastChannels.length === 0 && <div className="col-span-2"><EmptyState icon={<Tv size={40} />} label="No FAST channels yet" /></div>}
          </div>
        )}
      </div>

      <AnimatePresence>
        {viewFeed && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><MobileLiveViewer feed={viewFeed} onClose={() => setViewFeed(null)} /></motion.div>}
        {viewChannel && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><MobileFastViewer listing={viewChannel} onClose={() => setViewChannel(null)} /></motion.div>}
      </AnimatePresence>
    </div>
  );
};

const LiveRow: React.FC<{ feed: LiveFeed; onOpen: () => void }> = ({ feed, onOpen }) => (
  <button onClick={onOpen} className="w-full flex items-center gap-3 rounded-2xl overflow-hidden bg-white/5 border border-white/8 p-2 active:scale-[0.99] transition-transform text-left">
    <div className="relative w-28 aspect-video rounded-xl overflow-hidden bg-black shrink-0">
      {feed.ownerPhoto ? <img src={feed.ownerPhoto} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center"><Tv size={22} className="text-white/15" /></div>}
      <div className="absolute top-1.5 left-1.5 flex items-center gap-1 px-2 py-0.5 bg-red-600 rounded-full text-white text-[8px] font-black uppercase tracking-widest"><span className="w-1 h-1 rounded-full bg-white animate-ping" /> Live</div>
    </div>
    <div className="min-w-0 flex-1 pr-1">
      <h3 className="text-[13px] font-black text-white truncate leading-tight">{feed.title}</h3>
      <p className="text-[9px] font-black uppercase tracking-widest text-small-orange truncate mt-0.5">{feed.ownerName}</p>
    </div>
    <div className="p-2.5 rounded-full text-white shrink-0" style={{ background: GRAD }}><Play size={15} fill="white" /></div>
  </button>
);

const EmptyState: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
  <div className="py-24 flex flex-col items-center gap-4 opacity-25">
    {icon}<p className="text-[10px] font-black uppercase tracking-[0.3em] text-center">{label}</p>
  </div>
);

export default MobileLiveHub;
