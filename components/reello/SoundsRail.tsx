// ─── Sounds UI — the Chora ↔ Reello "use this sound" surface ─────────────────
//
// Blueprint Part 1B.2. Three reusable pieces, all safe to mount anywhere:
//
//   <SoundChip video>       — "♪ Original sound — <title>" on a short that has one
//   <SoundRail trackId>     — every short using that sound
//   <SoundRailSheet>        — the rail as a dismissable overlay
//
// Everything degrades silently: no soundTrackId → the chip renders nothing; an
// unresolvable sound → a generic "Original sound" label, never an error state.

import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Music2, Loader2, Play, X, Disc3 } from 'lucide-react';
import { Video } from '../../types';
import { extractSoundFromVideo, getSound, getVideosUsingSound, SoundRecord } from '../../services/soundsService';

const thumbFor = (v?: Partial<Video> | null): string => {
  if (!v) return '';
  if ((v as any).muxPlaybackId) return `https://image.mux.com/${(v as any).muxPlaybackId}/thumbnail.png?width=480&height=854&time=3`;
  return v.thumbnailUrl || (v as any).coverImageUrl || (v as any).coverImage || '';
};

const soundLabel = (sound: SoundRecord | null, fallback?: string): string => {
  if (sound?.title) return sound.title;
  return fallback || 'Original sound';
};

// ─────────────────────────────────────────────────────────────────────────────
// Sound chip — tappable, opens the rail
// ─────────────────────────────────────────────────────────────────────────────

export const SoundChip: React.FC<{
  /** Either pass the video (chip reads video.soundTrackId) or a trackId directly. */
  video?: Pick<Video, 'soundTrackId'> | null;
  trackId?: string;
  onOpen?: (trackId: string) => void;
  className?: string;
}> = ({ video, trackId, onOpen, className = '' }) => {
  const id = trackId || video?.soundTrackId || '';
  const [sound, setSound] = useState<SoundRecord | null>(null);

  useEffect(() => {
    if (!id) { setSound(null); return; }
    let alive = true;
    getSound(id).then(s => { if (alive) setSound(s); }).catch(() => { /* generic label */ });
    return () => { alive = false; };
  }, [id]);

  // No sound on this video — render nothing at all.
  if (!id) return null;

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onOpen?.(id); }}
      className={`group inline-flex items-center gap-2 max-w-full px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 hover:bg-white/20 transition-all ${className}`}
      title="See videos using this sound"
    >
      <Music2 size={12} className="text-small-orange shrink-0 group-hover:animate-pulse" />
      <span className="text-[9px] font-black uppercase tracking-widest text-white/80 truncate">
        {soundLabel(sound)}
      </span>
    </button>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// The rail — "videos using this sound"
// ─────────────────────────────────────────────────────────────────────────────

export const SoundRail: React.FC<{
  trackId: string;
  onPlay?: (v: Video) => void;
  /** Compact = horizontal scroller (in-feed). Otherwise a grid. */
  variant?: 'rail' | 'grid';
  limit?: number;
}> = ({ trackId, onPlay, variant = 'rail', limit = 40 }) => {
  const [sound, setSound] = useState<SoundRecord | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!trackId) { setVideos([]); setLoading(false); return; }
    setLoading(true);
    const [s, v] = await Promise.all([
      getSound(trackId).catch(() => null),
      getVideosUsingSound(trackId, limit).catch(() => [] as Video[]),
    ]);
    setSound(s);
    setVideos(v);
    setLoading(false);
  }, [trackId, limit]);

  useEffect(() => { let alive = true; load().catch(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [load]);

  const cover = sound?.coverUrl || thumbFor(videos[0]);

  return (
    <div className="space-y-5">
      {/* Sound header */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
          {cover
            ? <img src={cover} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
            : <Disc3 size={24} className="text-white/20" />}
        </div>
        <div className="min-w-0">
          <p className="text-[8px] font-black uppercase tracking-widest text-small-orange mb-1">Sound</p>
          <h3 className="text-sm font-black uppercase tracking-tight text-white truncate">{soundLabel(sound)}</h3>
          <p className="text-[9px] font-bold uppercase tracking-widest text-white/30 truncate">
            {sound?.artist || 'Plajah'}
            {sound?.isVideoAudio ? ' · from video' : ''}
            {' · '}
            {loading ? '…' : `${videos.length} ${videos.length === 1 ? 'video' : 'videos'}`}
          </p>
        </div>
      </div>

      {loading && (
        <div className="py-12 flex justify-center"><Loader2 size={20} className="animate-spin text-white/30" /></div>
      )}

      {!loading && !videos.length && (
        <div className="py-12 text-center space-y-3">
          <div className="flex justify-center opacity-20"><Music2 size={30} /></div>
          <p className="text-[10px] font-black uppercase tracking-widest text-white/30">No videos use this sound yet</p>
        </div>
      )}

      {!loading && !!videos.length && (
        <div className={variant === 'rail'
          ? 'flex gap-3 overflow-x-auto no-scrollbar pb-2'
          : 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3'}>
          {videos.map(v => {
            const t = thumbFor(v);
            return (
              <motion.button
                key={v.id}
                whileHover={{ y: -3 }}
                onClick={() => onPlay?.(v)}
                className={`group relative overflow-hidden rounded-2xl bg-white/5 border border-white/10 hover:border-white/25 transition-all text-left ${variant === 'rail' ? 'shrink-0 w-32' : 'w-full'}`}
                style={{ aspectRatio: '9 / 16' }}
              >
                {t
                  ? <img src={t} alt={v.title} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
                  : <div className="absolute inset-0 bg-white/5" />}
                <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 55%)' }} />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/40 flex items-center justify-center">
                    <Play size={14} fill="white" className="ml-0.5" />
                  </div>
                </div>
                <div className="absolute left-2 right-2 bottom-2">
                  <p className="text-[9px] font-black uppercase tracking-tight text-white leading-tight line-clamp-2">{v.title}</p>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Rail as a sheet — what the sound chip opens
// ─────────────────────────────────────────────────────────────────────────────

export const SoundRailSheet: React.FC<{
  trackId: string | null;
  onClose: () => void;
  onPlay?: (v: Video) => void;
}> = ({ trackId, onClose, onPlay }) => (
  <AnimatePresence>
    {trackId && (
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-6"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          onClick={e => e.stopPropagation()}
          className="w-full sm:max-w-3xl max-h-[85vh] overflow-y-auto no-scrollbar bg-[#0b0b0c] border border-white/10 rounded-t-3xl sm:rounded-3xl p-6 sm:p-8"
        >
          <div className="flex items-start justify-between mb-6">
            <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Videos using this sound</p>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center transition-all">
              <X size={14} />
            </button>
          </div>
          <SoundRail trackId={trackId} variant="grid" onPlay={(v) => { onPlay?.(v); onClose(); }} />
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

// ─────────────────────────────────────────────────────────────────────────────
// "Use this sound" — extract a short's audio into a reusable Chora sound
// ─────────────────────────────────────────────────────────────────────────────

export const UseThisSoundButton: React.FC<{
  video: Video | null | undefined;
  /** Called with the new sound's trackId once it exists. */
  onCreated?: (trackId: string) => void;
  className?: string;
}> = ({ video, onCreated, className = '' }) => {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (!video?.id) return null;

  // Already has a sound — the chip is the right affordance, not this button.
  if (video.soundTrackId) return null;

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await extractSoundFromVideo(video);
      if (!res) { setNote('Sign in to use this sound'); return; }
      onCreated?.(res.track.id);
      // Be honest about what happened: the sound is usable, but it is the video's
      // own audio track rather than a rendered audio-only asset.
      setNote(res.audioRendered ? 'Sound ready' : 'Sound created — plays the video audio');
    } catch {
      setNote('Could not create sound');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`inline-flex flex-col items-start gap-1 ${className}`}>
      <button
        onClick={(e) => { e.stopPropagation(); run(); }}
        disabled={busy}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/15 hover:bg-white/20 disabled:opacity-40 transition-all"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Music2 size={12} className="text-small-orange" />}
        <span className="text-[9px] font-black uppercase tracking-widest text-white/80">Use this sound</span>
      </button>
      {note && <span className="text-[8px] font-bold uppercase tracking-widest text-white/30 px-1">{note}</span>}
    </div>
  );
};

export default SoundRail;
