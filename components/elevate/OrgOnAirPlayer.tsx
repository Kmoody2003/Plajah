// components/elevate/OrgOnAirPlayer.tsx
// The org page's always-on window: whatever the org has on air (a live stream, or its channel in
// TV Live Hub+) plays inline, muted, as soon as the page opens. Tap to unmute; open full screen in
// Live TV+. Gating (Sanctuary / members-only) already happened in services/orgMedia.

import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Volume2, VolumeX, Maximize2, ChevronLeft, ChevronRight, Play, Pause } from 'lucide-react';
import type { OnAirItem } from '../../services/orgMedia';
import { hlsTuning, capLevelsToPanel } from '../../services/hlsTuning';
import { EV } from './vellum';

const ytId = (u: string) => (u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|live\/)|youtu\.be\/)([\w-]{11})/) || [])[1];
const twitchChannel = (u: string) => (u.match(/twitch\.tv\/([\w]+)/) || [])[1];
const embedSrc = (u: string, muted: boolean, startSec = 0): string | null => {
  const y = ytId(u);
  if (y) return `https://www.youtube.com/embed/${y}?autoplay=1&mute=${muted ? 1 : 0}&playsinline=1&controls=0&modestbranding=1${startSec ? `&start=${Math.floor(startSec)}` : ''}`;
  const t = twitchChannel(u);
  if (t) return `https://player.twitch.tv/?channel=${t}&parent=${location.hostname}&muted=${muted}&autoplay=true`;
  return null;
};

const OrgOnAirPlayer: React.FC<{
  items: OnAirItem[];
  onOpen?: (item: OnAirItem) => void;
}> = ({ items, onOpen }) => {
  const [activeKey, setActiveKey] = useState(items[0]?.key);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const activeIdx = Math.max(0, items.findIndex(i => i.key === activeKey));
  const item = items[activeIdx] || items[0];
  const pb = item?.playback;

  const stepChannel = (delta: 1 | -1) => {
    if (items.length <= 1) return;
    const nextIdx = (activeIdx + delta + items.length) % items.length;
    setActiveKey(items[nextIdx].key);
  };

  // Keep a valid selection as the lineup changes (a stream ends, a channel comes on air).
  useEffect(() => { if (!items.some(i => i.key === activeKey)) setActiveKey(items[0]?.key); }, [items, activeKey]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !pb || pb.kind === 'embed') return;
    v.muted = true;
    const seek = () => { if (pb.offsetSec && Number.isFinite(v.duration) && pb.offsetSec < v.duration) v.currentTime = pb.offsetSec; };
    v.addEventListener('loadedmetadata', seek, { once: true });
    let hls: Hls | null = null;
    if (pb.kind === 'hls' && !v.canPlayType('application/vnd.apple.mpegurl') && Hls.isSupported()) {
      hls = new Hls({ ...hlsTuning(), liveSyncDurationCount: 3 });
      hls.loadSource(pb.url);
      hls.attachMedia(v);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { capLevelsToPanel(hls as any); if (playing) v.play().catch(() => {}); });
    } else {
      v.src = pb.url;
      if (playing) v.play().catch(() => {});
    }
    return () => {
      v.removeEventListener('loadedmetadata', seek);
      if (hls) { try { hls.destroy(); } catch { /* */ } }
      v.removeAttribute('src');
      v.load();
    };
  }, [pb?.kind, pb?.url, pb?.offsetSec]);

  useEffect(() => { if (videoRef.current) videoRef.current.muted = muted; }, [muted]);
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !pb || pb.kind === 'embed') return;
    if (playing) v.play().catch(() => {});
    else v.pause();
  }, [playing, pb]);

  if (!item || !pb) return null;
  const embed = pb.kind === 'embed' ? embedSrc(pb.url, muted, pb.offsetSec) : null;

  return (
    <section aria-label="On air now" className="rounded-[20px] overflow-hidden" style={{ background: '#000' }}>
      <div
        className="relative aspect-video max-h-[62vh] w-full"
        onTouchStart={e => { const t = e.touches[0]; swipeStartRef.current = { x: t.clientX, y: t.clientY }; }}
        onTouchEnd={e => {
          const s = swipeStartRef.current;
          swipeStartRef.current = null;
          if (!s || items.length <= 1) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - s.x;
          if (Math.abs(dx) > 54 && Math.abs(t.clientY - s.y) < 48) {
            stepChannel(dx < 0 ? 1 : -1);
          }
        }}
      >
        {pb.kind === 'embed'
          ? (embed && <iframe key={embed} src={embed} title={item.title} className="absolute inset-0 w-full h-full" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />)
          : <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" poster={pb.poster} muted={muted} autoPlay playsInline loop={pb.kind === 'file'} />}

        <div className="absolute inset-x-0 top-0 p-3 sm:p-4 flex items-start justify-between gap-2 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.62), transparent)' }}>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.06em] uppercase" style={{ color: EV.ember }}>
              <span className="ev-live-dot" /> {item.feed ? 'Live now' : 'On air'}
              {items.length > 1 && <span className="text-white/70">· Ch {activeIdx + 1}/{items.length}</span>}
            </div>
            <div className="ev-title text-white text-base sm:text-xl truncate mt-0.5">{item.title}</div>
            {item.subtitle && <div className="text-[12px] text-white/70 truncate">{item.subtitle}</div>}
          </div>
        </div>

        {/* Always-reachable bottom control bar: play/pause, channel prev/next, mute, watch */}
        <div className="absolute inset-x-0 bottom-0 p-2.5 sm:p-3 flex items-center justify-between gap-2" style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.75), transparent)' }}>
          <div className="flex items-center gap-1.5">
            {pb.kind !== 'embed' && (
              <button type="button" onClick={() => setPlaying(p => !p)} aria-label={playing ? 'Pause' : 'Play'} className="ev-btn" style={{ minHeight: 36, minWidth: 36, padding: '0 10px', background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 12 }}>
                {playing ? <Pause size={14} /> : <Play size={14} />}
              </button>
            )}
            {items.length > 1 && (
              <>
                <button type="button" onClick={() => stepChannel(-1)} aria-label="Previous channel" className="ev-btn" style={{ minHeight: 36, minWidth: 36, padding: '0 8px', background: 'rgba(0,0,0,0.65)', color: '#fff' }}>
                  <ChevronLeft size={16} />
                </button>
                <button type="button" onClick={() => stepChannel(1)} aria-label="Next channel" className="ev-btn" style={{ minHeight: 36, minWidth: 36, padding: '0 8px', background: 'rgba(0,0,0,0.65)', color: '#fff' }}>
                  <ChevronRight size={16} />
                </button>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setMuted(m => !m)} aria-label={muted ? 'Unmute' : 'Mute'} className="ev-btn" style={{ minHeight: 36, padding: '0 12px', background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 12 }}>
              {muted ? <><VolumeX size={14} /> Unmute</> : <Volume2 size={14} />}
            </button>
            {onOpen && (
              <button type="button" onClick={() => onOpen(item)} aria-label="Watch full screen" className="ev-btn ev-btn-primary" style={{ minHeight: 36, padding: '0 12px', fontSize: 12 }}>
                <Maximize2 size={13} /> Watch
              </button>
            )}
          </div>
        </div>
      </div>

      {items.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide px-3 py-2" style={{ background: EV.panel }}>
          {items.map((i, idx) => (
            <button key={i.key} type="button" onClick={() => setActiveKey(i.key)} aria-pressed={i.key === item.key}
              className="shrink-0 px-3 py-1.5 rounded-full text-[12px] transition-colors whitespace-nowrap"
              style={i.key === item.key ? { background: 'linear-gradient(135deg, #6B0099, #D40055)', color: '#fff', fontWeight: 700 } : { background: 'rgba(255,255,255,0.06)', color: EV.muted }}>
              {idx + 1}. {i.title}
            </button>
          ))}
        </div>
      )}
    </section>
  );
};

export default OrgOnAirPlayer;
