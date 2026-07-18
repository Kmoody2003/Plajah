// ─── Live → Short: "clip this" ───────────────────────────────────────────────
//
// Blueprint Part 1C.3. Pick in/out points on a live or just-ended stream, save a
// clip with attribution back to the stream and its creator, and optionally publish
// it as a Reello short.
//
// The scrubber drives a real <video> element bound to the source Mux HLS playback
// (or any direct URL), so the in/out points you pick are the frames you get. The
// preview loops the selected range — that part is genuinely WYSIWYG.
//
// What is NOT here: an encode. liveClipService publishes a *virtual* clip (the
// source asset plus in/out points). The UI says so plainly rather than implying a
// render happened. See TODO(encode) in services/liveClipService.ts.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Scissors, X, Loader2, Play, Pause, Check, Radio, Share2, AlertTriangle } from 'lucide-react';
import { StreamArchive, Video } from '../../types';
import {
  LiveClip, createClip, publishClipAsShort, normalizeRange, formatClock,
  clipSourceUrl, clipThumbnailUrl, getClipsByUser, MIN_CLIP_SEC, MAX_CLIP_SEC,
} from '../../services/liveClipService';
import { auth } from '../../services/firebase';

// ─────────────────────────────────────────────────────────────────────────────
// Clip composer
// ─────────────────────────────────────────────────────────────────────────────

export const LiveClipComposer: React.FC<{
  archive: StreamArchive | null;
  /** Clipping a stream that is still live (no archive doc yet). */
  live?: { streamId: string; playbackId?: string; title: string; ownerId: string; ownerName: string; ownerPhoto?: string } | null;
  onClose: () => void;
  onClipped?: (clip: LiveClip) => void;
  onPublished?: (videoId: string) => void;
}> = ({ archive, live, onClose, onClipped, onPublished }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sourceDuration = archive?.durationMs ? archive.durationMs / 1000 : 0;

  const [duration, setDuration] = useState(sourceDuration);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(Math.min(30, sourceDuration || 30));
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<LiveClip | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playbackId = archive?.muxPlaybackId || live?.playbackId || '';
  const src = playbackId ? `https://stream.mux.com/${playbackId}.m3u8` : '';

  // Native HLS (Safari/iOS) plays .m3u8 directly; other browsers need MSE, which
  // the shared player already handles elsewhere. If we can't play it, the picker
  // still works off the known duration — it just loses the visual preview.
  const canPreview = !!src;

  const onLoaded = () => {
    const d = videoRef.current?.duration;
    if (d && isFinite(d) && d > 0) {
      setDuration(d);
      setEnd(e => Math.min(e || 30, d));
    }
  };

  // Loop the selection while previewing.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onTime = () => {
      const t = el.currentTime;
      setPosition(t);
      if (playing && t >= end) { el.currentTime = start; }
    };
    el.addEventListener('timeupdate', onTime);
    return () => el.removeEventListener('timeupdate', onTime);
  }, [playing, start, end]);

  const seek = useCallback((t: number) => {
    setPosition(t);
    const el = videoRef.current;
    if (el && isFinite(t)) { try { el.currentTime = t; } catch { /* not seekable yet */ } }
  }, []);

  const togglePlay = () => {
    const el = videoRef.current;
    if (!el) return;
    if (playing) { el.pause(); setPlaying(false); return; }
    if (position < start || position > end) { try { el.currentTime = start; } catch { /* */ } }
    el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  };

  const total = duration || sourceDuration || 0;
  const range = useMemo(() => normalizeRange(start, end, total || undefined), [start, end, total]);
  const clipLen = Math.max(0, range.endSec - range.startSec);

  const pct = (t: number) => (total > 0 ? Math.min(100, Math.max(0, (t / total) * 100)) : 0);

  const doSave = async () => {
    if (saving) return;
    if (!auth.currentUser) { setError('Sign in to clip'); return; }
    setSaving(true); setError(null);
    try {
      const clip = await createClip({
        archive: archive || undefined,
        live: live ? { ...live } : undefined,
        startSec: range.startSec,
        endSec: range.endSec,
        title: title.trim() || undefined,
      });
      if (!clip) { setError('Could not save the clip'); return; }
      setSaved(clip);
      onClipped?.(clip);
    } catch {
      setError('Could not save the clip');
    } finally {
      setSaving(false);
    }
  };

  const doPublish = async () => {
    if (!saved || publishing) return;
    setPublishing(true); setError(null);
    try {
      const videoId = await publishClipAsShort(saved);
      if (!videoId) { setError('Could not publish the short'); return; }
      onPublished?.(videoId);
      onClose();
    } catch {
      setError('Could not publish the short');
    } finally {
      setPublishing(false);
    }
  };

  const sourceLabel = archive?.title || live?.title || 'Live stream';
  const ownerLabel = archive?.ownerName || live?.ownerName || 'Creator';

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-sm p-0 sm:p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto no-scrollbar bg-[#0b0b0c] border border-white/10 rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 space-y-6"
      >
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-[8px] font-black uppercase tracking-widest text-small-orange mb-1 flex items-center gap-1.5">
              <Scissors size={10} /> Clip this
            </p>
            <h3 className="text-sm font-black uppercase tracking-tight text-white truncate">{sourceLabel}</h3>
            <p className="text-[9px] font-bold uppercase tracking-widest text-white/30 truncate">{ownerLabel}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center transition-all shrink-0">
            <X size={14} />
          </button>
        </div>

        {/* Preview */}
        <div className="relative rounded-2xl overflow-hidden bg-black border border-white/10" style={{ aspectRatio: '16 / 9' }}>
          {canPreview ? (
            <video
              ref={videoRef}
              src={src}
              playsInline
              preload="metadata"
              poster={playbackId ? `https://image.mux.com/${playbackId}/thumbnail.png?width=960&height=540&time=${Math.floor(range.startSec)}` : undefined}
              onLoadedMetadata={onLoaded}
              onPause={() => setPlaying(false)}
              className="absolute inset-0 w-full h-full object-contain"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/25">
              <Radio size={26} />
              <p className="text-[9px] font-black uppercase tracking-widest">No preview available</p>
            </div>
          )}
          {canPreview && (
            <button onClick={togglePlay} className="absolute bottom-3 left-3 w-10 h-10 rounded-full bg-white/15 backdrop-blur-md border border-white/30 flex items-center justify-center hover:bg-white/25 transition-all">
              {playing ? <Pause size={14} fill="white" /> : <Play size={14} fill="white" className="ml-0.5" />}
            </button>
          )}
        </div>

        {/* In / out picker */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[8px] font-black uppercase tracking-widest text-white/30">In / Out</p>
            <p className="text-[9px] font-black uppercase tracking-widest text-white/60">
              {formatClock(range.startSec)} – {formatClock(range.endSec)} · {clipLen.toFixed(1)}s
            </p>
          </div>

          {/* Track with the selected window highlighted */}
          <div className="relative h-2 rounded-full bg-white/8 overflow-hidden">
            <div
              className="absolute inset-y-0 bg-small-orange/60"
              style={{ left: `${pct(range.startSec)}%`, width: `${Math.max(1, pct(range.endSec) - pct(range.startSec))}%` }}
            />
            <div className="absolute inset-y-0 w-0.5 bg-white" style={{ left: `${pct(position)}%` }} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="space-y-1.5">
              <span className="text-[8px] font-black uppercase tracking-widest text-white/30">Start</span>
              <input
                type="range" min={0} max={Math.max(1, total)} step={0.1} value={range.startSec}
                onChange={e => { const v = parseFloat(e.target.value); setStart(v); if (v + MIN_CLIP_SEC > end) setEnd(Math.min(total || v + MIN_CLIP_SEC, v + MIN_CLIP_SEC)); seek(v); }}
                className="w-full accent-[#ff6b35]"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-[8px] font-black uppercase tracking-widest text-white/30">End</span>
              <input
                type="range" min={0} max={Math.max(1, total)} step={0.1} value={range.endSec}
                onChange={e => { const v = parseFloat(e.target.value); setEnd(v); if (v - MIN_CLIP_SEC < start) setStart(Math.max(0, v - MIN_CLIP_SEC)); seek(v); }}
                className="w-full accent-[#ff6b35]"
              />
            </label>
          </div>

          <div className="flex gap-2">
            <button onClick={() => { setStart(position); if (position + MIN_CLIP_SEC > end) setEnd(Math.min(total, position + Math.min(30, MAX_CLIP_SEC))); }}
              className="flex-1 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-[9px] font-black uppercase tracking-widest text-white/70 transition-all">
              Set in at playhead
            </button>
            <button onClick={() => { const v = Math.max(start + MIN_CLIP_SEC, position); setEnd(v); }}
              className="flex-1 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-[9px] font-black uppercase tracking-widest text-white/70 transition-all">
              Set out at playhead
            </button>
          </div>
          <p className="text-[8px] font-bold uppercase tracking-widest text-white/20">
            {MIN_CLIP_SEC}s minimum · {MAX_CLIP_SEC}s maximum
          </p>
        </div>

        {/* Title */}
        <label className="block space-y-1.5">
          <span className="text-[8px] font-black uppercase tracking-widest text-white/30">Clip title</span>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={`${sourceLabel} — clip`}
            className="w-full bg-white/5 border border-white/10 focus:border-white/30 rounded-xl px-4 py-2.5 text-[11px] font-bold text-white placeholder:text-white/20 outline-none transition-all"
          />
        </label>

        {/* Attribution — always shown, it is the point of the feature */}
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/10">
          {archive?.ownerPhoto || live?.ownerPhoto
            ? <img src={(archive?.ownerPhoto || live?.ownerPhoto) as string} alt="" className="w-8 h-8 rounded-full object-cover" />
            : <div className="w-8 h-8 rounded-full bg-white/10" />}
          <div className="min-w-0">
            <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Credits</p>
            <p className="text-[10px] font-bold text-white/70 truncate">Clipped from “{sourceLabel}” by {ownerLabel}</p>
          </div>
        </div>

        {/* Honest note about the encode */}
        <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-amber-500/[0.06] border border-amber-500/20">
          <AlertTriangle size={13} className="text-amber-400/80 shrink-0 mt-0.5" />
          <p className="text-[9px] font-bold leading-relaxed text-amber-200/60 uppercase tracking-widest">
            Clips currently play the source stream trimmed to your in/out points. A standalone rendered clip file is not produced yet.
          </p>
        </div>

        {error && <p className="text-[9px] font-black uppercase tracking-widest text-red-400">{error}</p>}

        {/* Actions */}
        <div className="flex gap-3">
          {!saved ? (
            <button onClick={doSave} disabled={saving || clipLen < MIN_CLIP_SEC}
              className="flex-1 py-3 rounded-xl bg-white text-black font-black text-[9px] uppercase tracking-widest hover:bg-small-orange hover:text-white disabled:opacity-30 transition-all flex items-center justify-center gap-2">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Scissors size={13} />} Save clip
            </button>
          ) : (
            <>
              <div className="flex-1 py-3 rounded-xl bg-green-500/15 border border-green-500/30 text-green-300 font-black text-[9px] uppercase tracking-widest flex items-center justify-center gap-2">
                <Check size={13} /> Clip saved
              </div>
              <button onClick={doPublish} disabled={publishing}
                className="flex-1 py-3 rounded-xl bg-white text-black font-black text-[9px] uppercase tracking-widest hover:bg-small-orange hover:text-white disabled:opacity-30 transition-all flex items-center justify-center gap-2">
                {publishing ? <Loader2 size={13} className="animate-spin" /> : <Share2 size={13} />} Publish as short
              </button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// My clips — everything this user has clipped
// ─────────────────────────────────────────────────────────────────────────────

export const MyClipsSection: React.FC<{ onPlay?: (v: Partial<Video>) => void }> = ({ onPlay }) => {
  const [clips, setClips] = useState<LiveClip[]>([]);
  const [loading, setLoading] = useState(true);
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) { setClips([]); setLoading(false); return; }
    let alive = true;
    setLoading(true);
    getClipsByUser(uid)
      .then(c => { if (alive) setClips(c); })
      .catch(() => { if (alive) setClips([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [uid]);

  if (loading) return <div className="py-10 flex justify-center"><Loader2 size={18} className="animate-spin text-white/30" /></div>;
  if (!clips.length) {
    return (
      <div className="py-10 text-center space-y-2">
        <div className="flex justify-center opacity-20"><Scissors size={26} /></div>
        <p className="text-[10px] font-black uppercase tracking-widest text-white/25">No clips yet — clip a live stream to make one</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {clips.map(c => {
        const t = clipThumbnailUrl(c);
        return (
          <motion.button
            key={c.id}
            whileHover={{ y: -3 }}
            onClick={() => onPlay?.({
              id: c.videoId || c.id,
              title: c.title,
              url: clipSourceUrl(c),
              muxPlaybackId: c.clipPlaybackId || c.sourcePlaybackId,
              thumbnailUrl: t,
              duration: c.durationSec,
            } as Partial<Video>)}
            className="group relative overflow-hidden rounded-2xl bg-white/5 border border-white/10 hover:border-white/25 transition-all text-left"
            style={{ aspectRatio: '16 / 9' }}
          >
            {t
              ? <img src={t} alt={c.title} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
              : <div className="absolute inset-0 bg-white/5" />}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, transparent 60%)' }} />
            <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[8px] font-black uppercase tracking-widest text-white/70">
              {c.durationSec.toFixed(0)}s
            </div>
            <div className="absolute left-3 right-3 bottom-2.5">
              <p className="text-[10px] font-black uppercase tracking-tight text-white leading-tight line-clamp-2">{c.title}</p>
              <p className="text-[8px] font-bold uppercase tracking-widest text-white/40 truncate mt-0.5">
                {c.sourceOwnerName}{c.videoId ? ' · published' : ''}
              </p>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
};

/** Small "Clip this" trigger, mountable next to any live/archived stream. */
export const ClipThisButton: React.FC<{ onClick: () => void; className?: string }> = ({ onClick, className = '' }) => (
  <button
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/15 transition-all ${className}`}
  >
    <Scissors size={13} className="text-small-orange" />
    <span className="text-[9px] font-black uppercase tracking-widest text-white/80">Clip this</span>
  </button>
);

/** Composer wrapped in its own exit animation — convenient for conditional mounts. */
export const LiveClipStudio: React.FC<React.ComponentProps<typeof LiveClipComposer> & { open: boolean }> = ({ open, ...props }) => (
  <AnimatePresence>{open && <LiveClipComposer {...props} />}</AnimatePresence>
);

export default LiveClipStudio;
