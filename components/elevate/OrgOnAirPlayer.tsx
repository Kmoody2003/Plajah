// components/elevate/OrgOnAirPlayer.tsx
// The org page's always-on window: whatever the org has on air (a live stream, or its channel in
// TV Live Hub+) plays inline, muted, as soon as the page opens. Tap to unmute; open full screen in
// Live TV+. Gating (Sanctuary / members-only) already happened in services/orgMedia.

import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Volume2, VolumeX, Maximize2 } from 'lucide-react';
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const item = items.find(i => i.key === activeKey) || items[0];
  const pb = item?.playback;

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
      hls.on(Hls.Events.MANIFEST_PARSED, () => { capLevelsToPanel(hls as any); v.play().catch(() => {}); });
    } else {
      v.src = pb.url;
      v.play().catch(() => {});
    }
    return () => {
      v.removeEventListener('loadedmetadata', seek);
      if (hls) { try { hls.destroy(); } catch { /* */ } }
      v.removeAttribute('src');
      v.load();
    };
  }, [pb?.kind, pb?.url, pb?.offsetSec]);

  useEffect(() => { if (videoRef.current) videoRef.current.muted = muted; }, [muted]);

  if (!item || !pb) return null;
  const embed = pb.kind === 'embed' ? embedSrc(pb.url, muted, pb.offsetSec) : null;

  return (
    <section aria-label="On air now" className="rounded-[20px] overflow-hidden" style={{ background: '#000' }}>
      <div className="relative aspect-video max-h-[62vh] w-full">
        {pb.kind === 'embed'
          ? (embed && <iframe key={embed} src={embed} title={item.title} className="absolute inset-0 w-full h-full" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />)
          : <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" poster={pb.poster} muted autoPlay playsInline loop={pb.kind === 'file'} />}

        <div className="absolute inset-x-0 top-0 p-4 flex items-start justify-between gap-3 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.55), transparent)' }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.06em] uppercase" style={{ color: EV.ember }}>
              <span className="ev-live-dot" /> {item.feed ? 'Live now' : 'On air'}
            </div>
            <div className="ev-title text-white text-lg sm:text-xl truncate mt-1">{item.title}</div>
            {item.subtitle && <div className="text-[13px] text-white/70 truncate">{item.subtitle}</div>}
          </div>
        </div>

        <div className="absolute right-3 bottom-3 flex items-center gap-2">
          <button onClick={() => setMuted(m => !m)} aria-label={muted ? 'Unmute' : 'Mute'} className="ev-btn" style={{ minHeight: 40, padding: '0 14px', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 13 }}>
            {muted ? <><VolumeX size={15} /> Tap to unmute</> : <Volume2 size={15} />}
          </button>
          {onOpen && (
            <button onClick={() => onOpen(item)} aria-label="Watch full screen" className="ev-btn ev-btn-primary" style={{ minHeight: 40, padding: '0 14px', fontSize: 13 }}>
              <Maximize2 size={14} /> Watch
            </button>
          )}
        </div>
      </div>

      {items.length > 1 && (
        <div className="flex gap-1 overflow-x-auto scrollbar-hide px-3 py-2" style={{ background: EV.panel }}>
          {items.map(i => (
            <button key={i.key} onClick={() => setActiveKey(i.key)} aria-pressed={i.key === item.key}
              className="shrink-0 px-3 py-2 rounded-lg text-[13px] transition-colors"
              style={i.key === item.key ? { background: EV.raised, color: EV.ink, fontWeight: 600 } : { color: EV.muted }}>
              {i.title}
            </button>
          ))}
        </div>
      )}
    </section>
  );
};

export default OrgOnAirPlayer;
