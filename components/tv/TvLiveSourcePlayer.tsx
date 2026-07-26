import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Hls from 'hls.js';
import { X, Radio, Lock } from 'lucide-react';
import type { ChannelSource } from '../../types';
import { auth } from '../../services/backendService';
import { checkMembership } from '../../services/sanctuaryService';

/**
 * A single live SOURCE, fullscreen on TV — the External 24/7 feed or a Reello live show.
 *
 * Source resolution priority (as the creator wanted): HLS first, then a YouTube/Twitch embed, then
 * Mux (which is HLS under the hood). Members-only sources are gated with the same Sanctuary check as
 * the FAST channel — a non-member gets a lock, not the stream. Hardware Back is consumed so it just
 * closes back to the Live section instead of navigating the app to login.
 */

const ytId = (u: string) => (u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|live\/)|youtu\.be\/)([\w-]{11})/) || [])[1];
const twitchChannel = (u: string) => (u.match(/twitch\.tv\/([\w]+)/) || [])[1];
const embedUrl = (u: string): string | null => {
  const y = ytId(u); if (y) return `https://www.youtube.com/embed/${y}?autoplay=1&mute=1`;
  const t = twitchChannel(u); if (t) return `https://player.twitch.tv/?channel=${t}&parent=${location.hostname}&muted=true`;
  return null;
};

const TvLiveSourcePlayer: React.FC<{ ownerId: string; source: ChannelSource; onClose: () => void }> = ({ ownerId, source, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [access, setAccess] = useState<'checking' | 'allowed' | 'denied'>(source.membersOnly ? 'checking' : 'allowed');

  const exit = useCallback(() => onClose(), [onClose]);

  // Sanctuary gate — members (or the owner) only, for a members-only source.
  useEffect(() => {
    if (!source.membersOnly) return;
    const me = auth.currentUser?.uid;
    if (me && me === ownerId) { setAccess('allowed'); return; }
    let alive = true;
    checkMembership(ownerId).then(m => { if (alive) setAccess(m ? 'allowed' : 'denied'); }).catch(() => { if (alive) setAccess('denied'); });
    return () => { alive = false; };
  }, [ownerId, source.membersOnly]);

  // Back (hardware event + keydown) closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const kc = e.keyCode || e.which;
      if (kc === 4 || kc === 27 || e.key === 'Backspace' || e.key === 'Escape' || e.key === 'XF86Back' || e.key === 'GoBack') { e.preventDefault(); e.stopImmediatePropagation(); exit(); }
    };
    const onHwBack = (e: Event) => { e.preventDefault(); exit(); };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('plajah:hardware-back', onHwBack);
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('plajah:hardware-back', onHwBack); };
  }, [exit]);

  // Resolve the stream: HLS (url or Mux) via hls.js/native; embeds render an iframe instead.
  const embed = source.type === 'EXTERNAL_LIVE' && source.url ? embedUrl(source.url) : null;
  const hlsSrc = !embed
    ? (source.muxPlaybackId ? `https://stream.mux.com/${source.muxPlaybackId}.m3u8` : source.url || '')
    : '';

  useEffect(() => {
    if (access !== 'allowed' || embed || !hlsSrc) return;
    const v = videoRef.current;
    if (!v) return;
    if (v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = hlsSrc; v.play().catch(() => {});
    } else if (Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength: 30, enableWorker: true, liveSyncDurationCount: 3 });
      hls.loadSource(hlsSrc); hls.attachMedia(v); hlsRef.current = hls;
      v.play().catch(() => {});
    } else {
      v.src = hlsSrc; v.play().catch(() => {});
    }
    return () => { if (hlsRef.current) { try { hlsRef.current.destroy(); } catch { /* */ } hlsRef.current = null; } };
  }, [access, embed, hlsSrc]);

  return createPortal(
    <div className="fixed inset-0 z-[300] bg-black" data-tv-no-trap>
      {access === 'denied' ? (
        <div className="absolute inset-0 grid place-items-center text-center px-10">
          <div>
            <Lock size={44} className="mx-auto text-white/40 mb-5" />
            <p className="text-2xl font-black text-white">Members-only live</p>
            <p className="text-white/50 mt-2">This live feed is for the creator's Sanctuary members.</p>
          </div>
        </div>
      ) : access === 'checking' ? (
        <div className="absolute inset-0 grid place-items-center text-white/30 text-xs font-black uppercase tracking-widest">Checking access…</div>
      ) : embed ? (
        <iframe src={embed} className="absolute inset-0 w-full h-full" allow="autoplay; fullscreen; encrypted-media" allowFullScreen title={source.name} />
      ) : (
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-contain" autoPlay playsInline muted />
      )}

      {/* Header: live dot + name + close. */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-10 py-5 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          <Radio size={16} className="text-white/70" />
          <span className="text-sm font-black uppercase tracking-widest text-white">{source.name || 'Live'}</span>
        </div>
        <button onClick={exit} aria-label="Close" className="flex items-center gap-2 pl-4 pr-5 py-2.5 rounded-full bg-black/60 border border-white/20 text-white">
          <X size={18} /><span className="text-[10px] font-black uppercase tracking-widest">Close</span>
        </button>
      </div>
    </div>,
    document.body,
  );
};

export default TvLiveSourcePlayer;
