import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { Lock, FolderUp, Film, Play, Trash2, Loader2, Clapperboard } from 'lucide-react';
import { Video } from '../types';
import { fetchPersonalVideos, uploadPersonalVideo, deletePersonalVideo, uploadFile, auth } from '../services/backendService';
import { captureVideoPoster } from '../services/videoPoster';

const VIDEO_RE = /\.(mp4|m4v|mov|mkv|webm|avi|wmv|flv|mpg|mpeg|ts|ogv)$/i;
const isVideoFile = (f: File): boolean => (f.type && f.type.startsWith('video/')) || VIDEO_RE.test(f.name);

// Parse a filename into a clean title + optional TV season/episode.
// Handles "Show S01E02", "Show 1x02", and general cleanup of dots/underscores.
const parseVideoName = (name: string): { title: string; series?: string; season?: number; episode?: number } => {
  const base = name.replace(/\.[^/.]+$/, '').replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
  const m = base.match(/^(.*?)[\s-]*[sS](\d{1,2})[\s.-]*[eE](\d{1,2})(.*)$/) || base.match(/^(.*?)[\s-]*(\d{1,2})x(\d{1,2})(.*)$/);
  if (m) {
    const series = m[1].trim().replace(/[-\s]+$/, '');
    const season = parseInt(m[2], 10);
    const episode = parseInt(m[3], 10);
    const rest = (m[4] || '').trim().replace(/^[-\s]+/, '');
    return { title: `${series} · S${season}E${String(episode).padStart(2, '0')}${rest ? ` — ${rest}` : ''}`, series, season, episode };
  }
  // Strip common release cruft from a movie title (year kept).
  const title = base.replace(/\b(1080p|720p|2160p|4k|x264|x265|hevc|bluray|webrip|hdrip|web-dl|dvdrip)\b.*$/i, '').trim();
  return { title: title || base };
};

const PersonalVideoLocker: React.FC<{ onPlay: (video: Video) => void }> = ({ onPlay }) => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const uid = auth.currentUser?.uid;

  const load = useCallback(async () => {
    setLoading(true);
    setVideos(await fetchPersonalVideos());
    setLoading(false);
  }, []);

  useEffect(() => { if (uid) load(); else setLoading(false); }, [uid, load]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const vids = Array.from(files).filter(isVideoFile);
    if (vids.length === 0) { alert('No supported video files found in that selection.'); return; }
    setProgress({ done: 0, total: vids.length });
    try {
      let done = 0;
      for (const file of vids) {
        const parsed = parseVideoName(file.name);
        // Grab a poster frame locally, upload it, and use it as the thumbnail.
        let thumbnailUrl: string | undefined;
        try {
          const poster = await captureVideoPoster(file);
          if (poster && auth.currentUser) {
            thumbnailUrl = await uploadFile(`personal/${auth.currentUser.uid}/posters/${Date.now()}_${file.name.replace(/[^a-z0-9]/gi, '_')}.jpg`, poster);
          }
        } catch { /* poster optional */ }
        const uploaded = await uploadPersonalVideo({
          // category MOVIE routes it to the Taleo player (MovieUXView); series
          // details are preserved in tvMetadata for display/organisation.
          title: parsed.title,
          category: 'MOVIE',
          thumbnailUrl,
          coverImageUrl: thumbnailUrl,
          tvMetadata: parsed.series ? { seriesTitle: parsed.series, seasonNumber: parsed.season, episodeNumber: parsed.episode } : undefined,
        } as any, file);
        if (uploaded) setVideos(prev => [uploaded, ...prev]);
        done++; setProgress({ done, total: vids.length });
      }
    } catch (err) {
      console.error('Video locker upload failed:', err);
    } finally {
      setProgress(null);
      e.target.value = '';
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Remove this from your locker?')) return;
    await deletePersonalVideo(id);
    setVideos(prev => prev.filter(v => v.id !== id));
  };

  return (
    <div className="mt-4">
      {/* Private locker notice */}
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/10 mb-5">
        <Lock size={16} className="text-[#D0BCFF] mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-[11px] font-black uppercase tracking-widest text-white">Your private movie & TV locker</p>
          <p className="text-[10px] text-white/40 mt-1 leading-relaxed">Bring your own movie and TV collection — upload a folder and stream it in Taleo from any device you sign in on. These titles are <span className="text-white/70 font-bold">private to you and are never shared, posted, or discoverable</span>.</p>
        </div>
        <label className="flex items-center gap-2 px-5 py-2.5 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-[#D0BCFF] transition-all shrink-0">
          <FolderUp size={14} /> Upload
          <input type="file" {...({ webkitdirectory: '', directory: '' } as any)} multiple accept="video/*" className="hidden" onChange={handleUpload} />
        </label>
      </div>

      {progress && (
        <div className="p-6 bg-white/5 border border-white/10 border-dashed rounded-2xl flex flex-col items-center gap-3 mb-5">
          <Loader2 size={22} className="animate-spin text-white/40" />
          <p className="text-[10px] font-black uppercase tracking-widest text-white/60">Uploading to your locker — {progress.done} of {progress.total}</p>
          <div className="w-full max-w-sm h-1 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-[#D0BCFF] transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} /></div>
        </div>
      )}

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 size={22} className="animate-spin text-white/30" /></div>
      ) : videos.length === 0 ? (
        <div className="py-24 flex flex-col items-center justify-center bg-white/[0.02] rounded-3xl border border-dashed border-white/10">
          <Clapperboard className="text-white/15 mb-5" size={52} />
          <p className="text-white/30 font-black text-lg uppercase tracking-widest mb-1">Your locker is empty</p>
          <p className="text-white/20 text-[11px] uppercase tracking-widest">Upload a folder of your movies & shows</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {videos.map(v => (
            <motion.div key={v.id} whileHover={{ scale: 1.02 }} className="group relative aspect-[2/3] rounded-2xl overflow-hidden bg-white/5 border border-white/8 hover:border-[#D0BCFF]/30 transition-all">
              <button onClick={() => onPlay(v)} className="absolute inset-0 w-full h-full text-left">
                {(v.thumbnailUrl || v.coverImageUrl) ? (
                  <img src={v.thumbnailUrl || v.coverImageUrl} loading="lazy" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt={v.title} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#1a1a2e] to-black"><Film size={40} className="text-white/15" /></div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><span className="w-12 h-12 rounded-full bg-white/20 border border-white/40 flex items-center justify-center backdrop-blur-sm"><Play size={18} fill="white" className="ml-0.5" /></span></div>
                <div className="absolute bottom-0 p-3 w-full">
                  {v.tvMetadata?.seriesTitle && <p className="text-[8px] font-black uppercase tracking-widest text-[#D0BCFF] truncate">{v.tvMetadata.seriesTitle}</p>}
                  <h4 className="text-xs font-black truncate uppercase tracking-tight text-white">{v.tvMetadata?.seriesTitle ? `S${v.tvMetadata.seasonNumber || 1}·E${v.tvMetadata.episodeNumber || ''}` : v.title}</h4>
                </div>
              </button>
              <button onClick={() => remove(v.id)} title="Remove from locker" className="absolute top-2 right-2 z-10 p-2 rounded-full bg-black/60 text-white/60 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={13} /></button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PersonalVideoLocker;
