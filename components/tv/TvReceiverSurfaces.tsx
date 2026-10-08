// TvReceiverSurfaces — the lean full-screen renderers a TV receiver needs that the browser
// receiver (AmboPartyEventReceiver) does not provide: a switcher PROGRAM_FEED, a PARTY_DISPLAY,
// and AMBIENT_SIGNAGE (business signage slides or a welcome card). Lazy-loaded by TvReceiverHost
// so an idle TV never pays for hls.js / rtc / party code.
//
// No key handling here — TvReceiverHost owns the remote while receiving.

import { thumb, heroImage, THUMB, onThumbError } from '../../src/lib/imageThumb';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import { useRtcSession } from '../../hooks/useRtcSession';
import { useParty } from '../../hooks/useParty';
import { shouldResync } from '../../services/partyService';
import { fetchSignageSlides } from '../../services/businessService';
import { hlsTuning, capLevelsToPanel } from '../../services/hlsTuning';
import type { DigitalSignageSlide } from '../../types';
import type { EventDeviceDuty } from '../../services/ambo/amboPartyEventService';

const Center: React.FC<{ title: string; sub?: string }> = ({ title, sub }) => (
  <div className="absolute inset-0 grid place-items-center text-center px-10">
    <div>
      <div className="text-3xl font-black text-white">{title}</div>
      {sub && <div className="mt-3 text-lg text-white/50">{sub}</div>}
    </div>
  </div>
);

// ── PROGRAM_FEED: watch a Plajah live 'stage' stream as a recv-only viewer ──────

export const TvProgramFeed: React.FC<{ streamId: string; deviceId: string; muted?: boolean }> = ({ streamId, deviceId, muted }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  // The operator and the TV are usually the SAME account — rtcCore's selfId defaults to the auth
  // uid, which would collide with the host peer. A device-scoped id keeps the TV a distinct viewer.
  const config = useMemo(() => ({
    sessionId: streamId,
    selfId: `tv_${deviceId}`,
    topology: 'stage' as const,
    role: 'viewer' as const,
    media: { audio: false, video: false },
    displayName: 'TV receiver',
  }), [streamId, deviceId]);
  const rtc = useRtcSession(config as any);
  const host = rtc.remotePeers.find(p => p.role === 'host') || rtc.remotePeers[0];
  const stream = host?.stream || null;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.srcObject = stream;
    if (stream) v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
  }, [stream]);

  return (
    <div className="absolute inset-0 bg-black">
      <video ref={videoRef} className="absolute inset-0 w-full h-full object-contain" autoPlay playsInline muted={!!muted} />
      {!stream && <Center title={rtc.error ? 'Program feed unavailable' : 'Connecting to program…'} sub={rtc.error || 'Waiting for the switcher to go live'} />}
    </div>
  );
};

// ── PARTY_DISPLAY: follow a watch/listen party locally ─────────────────────────

const hlsOrUrl = (url?: string, mux?: string) => (mux ? `https://stream.mux.com/${mux}.m3u8` : url || '');

export const TvPartyDisplay: React.FC<{ partyId: string }> = ({ partyId }) => {
  const { party, loading, getTarget, playback } = useParty(partyId);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [trackUrl, setTrackUrl] = useState<{ url: string; cover?: string; title?: string } | null>(null);

  // LISTEN: resolve the current album track.
  useEffect(() => {
    if (party?.kind !== 'LISTEN') { setTrackUrl(null); return; }
    let alive = true;
    import('../../services/backendService').then(async m => {
      const alb: any = await m.fetchAlbumById(party.content.id).catch(() => null);
      if (!alive || !alb) return;
      const tracks: any[] = alb.tracks || [];
      const idx = Math.max(0, Math.min(tracks.length - 1, playback?.trackIndex ?? 0));
      const t = tracks.find(x => x.id === playback?.contentId) || tracks[idx];
      if (t) setTrackUrl({ url: hlsOrUrl(t.url, t.muxPlaybackId), cover: alb.coverImage, title: t.title });
    });
    return () => { alive = false; };
  }, [party?.kind, party?.content?.id, playback?.trackIndex, playback?.contentId]);

  const src = party?.kind === 'WATCH' ? hlsOrUrl(party.content.url, party.content.muxPlaybackId)
    : party?.kind === 'LISTEN' ? trackUrl?.url || '' : '';

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !src) return;
    if (/\.m3u8/.test(src) && !v.canPlayType('application/vnd.apple.mpegurl') && Hls.isSupported()) {
      const hls = new Hls(hlsTuning());
      hls.loadSource(src); hls.attachMedia(v); hlsRef.current = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, () => capLevelsToPanel(hls as any));
    } else {
      v.src = src;
    }
    return () => { if (hlsRef.current) { try { hlsRef.current.destroy(); } catch { /* */ } hlsRef.current = null; } };
  }, [src]);

  // Follow the host: one cheap tick per second.
  useEffect(() => {
    const t = window.setInterval(() => {
      const v = videoRef.current;
      if (!v || !src) return;
      const { targetPositionSec, shouldPlay } = getTarget();
      if (shouldResync(v.currentTime, targetPositionSec)) { try { v.currentTime = targetPositionSec; } catch { /* */ } }
      if (shouldPlay && v.paused) v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
      if (!shouldPlay && !v.paused) v.pause();
    }, 1000);
    return () => window.clearInterval(t);
  }, [getTarget, src]);

  if (loading) return <Center title="Joining party…" />;
  if (!party || party.isActive === false) return <Center title="This party has ended" sub="Press Back to stop receiving" />;
  if (party.kind === 'READ') return <Center title={party.content.title || 'Read-along'} sub="Read-along parties can't be shown on a TV yet" />;

  return (
    <div className="absolute inset-0 bg-black">
      {party.kind === 'LISTEN' && (trackUrl?.cover || party.content.thumbnail) && (
        <img src={heroImage(trackUrl?.cover || party.content.thumbnail)} onError={onThumbError(trackUrl?.cover || party.content.thumbnail)} decoding="async" alt="" className="absolute inset-0 w-full h-full object-contain" />
      )}
      <video ref={videoRef} playsInline
        className={party.kind === 'LISTEN' ? 'hidden' : 'absolute inset-0 w-full h-full object-contain'} />
      {party.kind === 'LISTEN' && (
        <div className="absolute bottom-10 left-10 right-10 text-white">
          <div className="text-4xl font-black">{trackUrl?.title || party.content.title}</div>
          <div className="text-lg text-white/60 mt-1">Listening party · {party.hostName || 'Host'}</div>
        </div>
      )}
    </div>
  );
};

// ── AMBIENT_SIGNAGE ────────────────────────────────────────────────────────────

export const TvSignage: React.FC<{ duty: EventDeviceDuty }> = ({ duty }) => {
  const pageId = duty.sourceData?.signagePageId;
  const [slides, setSlides] = useState<DigitalSignageSlide[]>([]);
  const [idx, setIdx] = useState(0);
  const [clock, setClock] = useState('');

  useEffect(() => {
    if (!pageId) { setSlides([]); return; }
    let alive = true;
    const load = () => fetchSignageSlides(pageId)
      .then(s => { if (alive) setSlides(s.filter(x => x.isActive)); })
      .catch(() => { /* keep what we have — a signage TV must not go blank on a network blip */ });
    load();
    const t = window.setInterval(load, 5 * 60_000);   // pick up edits without a listener
    return () => { alive = false; window.clearInterval(t); };
  }, [pageId]);

  useEffect(() => {
    if (slides.length < 2) return;
    const t = window.setTimeout(() => setIdx(i => (i + 1) % slides.length), (slides[idx % slides.length]?.durationSeconds || 8) * 1000);
    return () => window.clearTimeout(t);
  }, [slides, idx]);

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    tick();
    const t = window.setInterval(tick, 30_000);
    return () => window.clearInterval(t);
  }, []);

  const s = slides.length ? slides[idx % slides.length] : null;
  if (s) {
    return (
      <div className="absolute inset-0 flex items-center justify-center" style={{ background: s.backgroundColor || '#000' }}>
        {s.type === 'IMAGE' && s.url && <img src={heroImage(s.url)} onError={onThumbError(s.url)} decoding="async" alt="" className="w-full h-full object-contain" />}
        {s.type === 'VIDEO' && s.url && <video key={s.id} src={s.url} autoPlay muted loop playsInline className="w-full h-full object-contain" />}
        {(s.type === 'TEXT' || s.type === 'PROMO' || !s.url) && (
          <div className="text-center p-12 text-white">
            {s.type === 'PROMO' && <div className="text-sm font-black uppercase tracking-[0.3em] mb-4" style={{ color: '#FF8C00' }}>Special offer</div>}
            <div className="text-7xl font-black tracking-tight">{s.headline}</div>
            {s.subtext && <div className="mt-6 text-3xl text-white/70">{s.subtext}</div>}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-12"
      style={{ background: 'radial-gradient(circle at center, rgba(218,0,243,0.14) 0%, #05040a 70%)' }}>
      <h1 className="text-7xl font-black tracking-tight text-white">{duty.sourceData?.headline || duty.title || 'Welcome'}</h1>
      <p className="mt-5 text-3xl text-white/60 max-w-4xl">{duty.sourceData?.subheadline || duty.subtitle || ''}</p>
      <div className="absolute bottom-10 right-12 text-4xl font-black text-white/70 tabular-nums">{clock}</div>
    </div>
  );
};
