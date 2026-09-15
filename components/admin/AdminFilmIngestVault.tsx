import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  HardDrive,
  Download,
  Pause,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Folder,
  FileCheck,
  Film,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Clock,
  Layers,
  Archive,
  Info,
  ChevronRight,
  Database,
  Eye,
  X
} from 'lucide-react';
import { ArchiveVideo } from '../../services/archiveContentService';

interface FilmVaultItemWithJob {
  identifier: string;
  title: string;
  year: string;
  director: string;
  archive: 'KOFA' | 'EUROPEANA' | 'INTERNET_ARCHIVE' | 'LIBRARY_OF_CONGRESS';
  rights: string;
  runtime: string;
  genre: string;
  youtubeUrl?: string;
  directDownloadUrl?: string;
  thumbnailUrl: string;
  description: string;
  curatorNote: string;
  dataProvider: string;
  sourcePageUrl: string;
  estimatedSizeBytes: number;
  jobStatus: {
    identifier: string;
    status: 'IDLE' | 'DOWNLOADING' | 'PAUSED' | 'COMPLETED' | 'ERROR';
    bytesDownloaded: number;
    totalBytes: number;
    progressPercent: number;
    speedFormatted: string;
    etaFormatted: string;
    error?: string;
    localVideoPath?: string;
    localThumbnailPath?: string;
    lastUpdated: number;
  };
}

interface DiskStats {
  freeBytes: number;
  totalBytes: number;
  freeGb: string;
  totalGb: string;
}

interface AdminFilmIngestVaultProps {
  onPreviewFilm?: (film: ArchiveVideo) => void;
}

export const AdminFilmIngestVault: React.FC<AdminFilmIngestVaultProps> = ({ onPreviewFilm }) => {
  const [vaultDir, setVaultDir] = useState<string>('');
  const [inputDir, setInputDir] = useState<string>('');
  const [diskStats, setDiskStats] = useState<DiskStats | null>(null);
  const [films, setFilms] = useState<FilmVaultItemWithJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingDir, setSavingDir] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'KOFA' | 'EUROPEANA' | 'INTERNET_ARCHIVE' | 'COMPLETED'>('ALL');
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [previewingFilm, setPreviewingFilm] = useState<FilmVaultItemWithJob | null>(null);

  const pollTimerRef = useRef<any>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/admin/film-ingest/status');
      if (res.ok) {
        const data = await res.json();
        setVaultDir(data.vaultDirectory || '');
        if (!inputDir) setInputDir(data.vaultDirectory || '');
        setDiskStats(data.disk || null);
        setFilms(data.films || []);
      }
    } catch (err: any) {
      console.error('Error fetching vault status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    // Auto-refresh interval
    pollTimerRef.current = setInterval(() => {
      fetchStatus();
    }, 2500);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  const handleUpdateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputDir.trim()) return;
    setSavingDir(true);
    try {
      const res = await fetch('/api/admin/film-ingest/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: inputDir.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setVaultDir(data.vaultDirectory);
        setDiskStats(data);
        setActionMessage({ type: 'success', text: `Vault and ingest staging location set to: ${data.vaultDirectory}` });
        fetchStatus();
      } else {
        setActionMessage({ type: 'error', text: data.error || 'Failed to update folder' });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setSavingDir(false);
    }
  };

  const handleStartDownload = async (identifier: string) => {
    try {
      const res = await fetch('/api/admin/film-ingest/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionMessage({ type: 'info', text: `Download initiated with auto-resume enabled for ${identifier}` });
        fetchStatus();
      } else {
        setActionMessage({ type: 'error', text: data.error || 'Could not start download' });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  const handlePauseDownload = async (identifier: string) => {
    try {
      const res = await fetch('/api/admin/film-ingest/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionMessage({ type: 'info', text: `Download paused cleanly. Partial progress saved on disk.` });
        fetchStatus();
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  const handleDownloadAll = async () => {
    try {
      const res = await fetch('/api/admin/film-ingest/download-all', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionMessage({
          type: 'success',
          text: `Batch auto-resume queue initiated: ${data.queued.length} title(s) queued.`,
        });
        fetchStatus();
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  const handlePauseAll = async () => {
    try {
      const res = await fetch('/api/admin/film-ingest/pause-all', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionMessage({
          type: 'info',
          text: `All active film downloads have been paused. Ready to resume at any time.`,
        });
        fetchStatus();
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  const handleGenerateManifest = async () => {
    try {
      const res = await fetch('/api/admin/film-ingest/generate-manifest', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionMessage({
          type: 'success',
          text: `Attribution manifest generated at: ${data.manifestPath}`,
        });
      } else {
        setActionMessage({ type: 'error', text: data.error || 'Failed to generate manifest' });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  const filteredFilms = films.filter((f) => {
    if (activeFilter === 'ALL') return true;
    if (activeFilter === 'COMPLETED') return f.jobStatus?.status === 'COMPLETED';
    return f.archive === activeFilter;
  });

  const completedCount = films.filter((f) => f.jobStatus?.status === 'COMPLETED').length;
  const downloadingCount = films.filter((f) => f.jobStatus?.status === 'DOWNLOADING').length;

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${mb.toFixed(0)} MB`;
  };

  return (
    <div className="space-y-10 pb-32">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <HardDrive size={24} />
            </div>
            <div>
              <h1 className="text-3xl font-black uppercase tracking-tight text-white flex items-center gap-3">
                Film Ingest & Archive Vault
                <span className="text-[9px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-black tracking-widest uppercase">
                  Auto-Resume Resilient
                </span>
              </h1>
              <p className="text-white/40 text-xs font-bold uppercase tracking-widest mt-1">
                Automated Public Domain Film Puller · Disk Location Manager · Plajah Ingest Pipeline
              </p>
            </div>
          </div>
        </div>

        {/* Global Summary Badges */}
        <div className="flex items-center gap-3">
          <div className="px-5 py-3 rounded-2xl bg-white/5 border border-white/10 text-right">
            <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Vault Titles</p>
            <p className="text-lg font-black text-white">{completedCount} / {films.length} Ingested</p>
          </div>
          {downloadingCount > 0 && (
            <div className="px-5 py-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-right animate-pulse">
              <p className="text-[9px] font-black uppercase tracking-widest text-blue-400">Active Downloads</p>
              <p className="text-lg font-black text-blue-300">{downloadingCount} In Progress</p>
            </div>
          )}
        </div>
      </div>

      {/* Action Notification Alert */}
      <AnimatePresence>
        {actionMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`p-4 rounded-2xl border flex items-center justify-between text-xs font-bold ${
              actionMessage.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : actionMessage.type === 'error'
                ? 'bg-red-500/10 border-red-500/30 text-red-300'
                : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
            }`}
          >
            <div className="flex items-center gap-3">
              {actionMessage.type === 'success' ? (
                <CheckCircle2 size={18} />
              ) : actionMessage.type === 'error' ? (
                <AlertCircle size={18} />
              ) : (
                <Info size={18} />
              )}
              <span>{actionMessage.text}</span>
            </div>
            <button
              onClick={() => setActionMessage(null)}
              className="text-white/40 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drive Location & Ingest Staging Setting */}
      <div className="p-8 bg-white/5 border border-white/10 rounded-3xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight text-white flex items-center gap-2">
              <Folder size={20} className="text-amber-400" />
              Physical Disk Vault & Ingest Folder
            </h2>
            <p className="text-xs text-white/50 mt-1">
              Select any target drive or local directory (e.g. external SSD <code className="text-white/80 bg-white/10 px-1 py-0.5 rounded">D:\plajah-media\films</code> or local folder).
              This directory serves as both the secure download destination and the ingest folder for Plajah self-hosting.
            </p>
          </div>

          {diskStats && (
            <div className="flex items-center gap-4 bg-white/5 px-4 py-2 rounded-2xl border border-white/10 text-xs">
              <div>
                <p className="text-[9px] uppercase font-black tracking-widest text-white/40">Free Disk Space</p>
                <p className="font-black text-emerald-400">{diskStats.freeGb} GB Free <span className="text-white/40 font-normal">/ {diskStats.totalGb} GB</span></p>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleUpdateFolder} className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <input
              type="text"
              value={inputDir}
              onChange={(e) => setInputDir(e.target.value)}
              placeholder="e.g. D:\plajah-media\films or C:\vault\films"
              className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={savingDir}
            className="w-full sm:w-auto px-6 py-3 bg-amber-500 hover:bg-amber-400 text-black font-black uppercase text-xs tracking-widest rounded-2xl transition-all shadow-lg hover:scale-[1.02] flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
          >
            {savingDir ? <RefreshCw size={14} className="animate-spin" /> : <HardDrive size={14} />}
            Set Folder Location
          </button>
        </form>

        <div className="flex items-center gap-2 text-[10px] text-white/40 font-mono">
          <span>Active Path:</span>
          <span className="text-white/80 bg-white/5 px-2 py-0.5 rounded border border-white/5 truncate">{vaultDir}</span>
        </div>
      </div>

      {/* Batch Operations Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white/5 p-6 rounded-3xl border border-white/10">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleDownloadAll}
            className="px-5 py-2.5 bg-white text-black hover:bg-white/90 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-all shadow"
          >
            <Download size={14} />
            Download / Resume All
          </button>
          <button
            onClick={handlePauseAll}
            className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-all border border-white/10"
          >
            <Pause size={14} />
            Pause All
          </button>
          <button
            onClick={handleGenerateManifest}
            className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-all border border-white/10"
          >
            <FileCheck size={14} className="text-emerald-400" />
            Generate Attribution Manifest
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1 bg-black/40 p-1 rounded-2xl border border-white/10 text-[10px] font-black uppercase tracking-wider">
          {(['ALL', 'KOFA', 'EUROPEANA', 'INTERNET_ARCHIVE', 'COMPLETED'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveFilter(tab)}
              className={`px-3 py-1.5 rounded-xl transition-all ${
                activeFilter === tab
                  ? 'bg-white text-black shadow'
                  : 'text-white/50 hover:text-white'
              }`}
            >
              {tab === 'INTERNET_ARCHIVE' ? 'US / Archive' : tab}
            </button>
          ))}
        </div>
      </div>

      {/* Films List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredFilms.map((film) => {
          const job = film.jobStatus;
          const isDownloading = job?.status === 'DOWNLOADING';
          const isPaused = job?.status === 'PAUSED';
          const isCompleted = job?.status === 'COMPLETED';
          const isError = job?.status === 'ERROR';

          return (
            <div
              key={film.identifier}
              className="bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col justify-between hover:border-white/20 transition-all group relative overflow-hidden"
            >
              {/* Card Header & Artwork */}
              <div className="flex gap-4">
                <div className="w-28 h-36 rounded-2xl overflow-hidden bg-black/40 shrink-0 relative border border-white/10">
                  <img
                    src={film.thumbnailUrl}
                    alt={film.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute top-2 left-2">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border shadow ${
                        film.archive === 'KOFA'
                          ? 'bg-red-500/80 text-white border-red-400'
                          : film.archive === 'EUROPEANA'
                          ? 'bg-blue-500/80 text-white border-blue-400'
                          : 'bg-emerald-500/80 text-white border-emerald-400'
                      }`}
                    >
                      {film.archive}
                    </span>
                  </div>
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-base font-black text-white leading-tight line-clamp-1">{film.title}</h3>
                      <span className="text-xs text-white/40 font-mono shrink-0">{film.year}</span>
                    </div>
                    <p className="text-[11px] text-white/60 font-medium mt-0.5">
                      Dir. {film.director} · {film.runtime} · {film.genre}
                    </p>
                    <p className="text-[10px] text-white/40 line-clamp-2 mt-2 leading-relaxed">
                      {film.curatorNote || film.description}
                    </p>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[9px] font-mono text-white/40">
                    <span>Est. Size: {formatBytes(film.estimatedSizeBytes)}</span>
                    <span className="text-white/60 truncate max-w-[140px]">{film.rights}</span>
                  </div>
                </div>
              </div>

              {/* Progress Bar & Status */}
              <div className="mt-6 pt-4 border-t border-white/5 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isDownloading
                          ? 'bg-blue-400 animate-ping'
                          : isCompleted
                          ? 'bg-emerald-400'
                          : isPaused
                          ? 'bg-amber-400'
                          : isError
                          ? 'bg-red-400'
                          : 'bg-white/20'
                      }`}
                    />
                    <span className="text-[10px] font-black uppercase tracking-wider text-white">
                      {isDownloading
                        ? 'Downloading (Resumable Stream)'
                        : isCompleted
                        ? 'Ready / Ingested into Plajah'
                        : isPaused
                        ? 'Paused (Offset Preserved)'
                        : isError
                        ? 'Error encountered'
                        : 'Ready to Pull'}
                    </span>
                  </div>

                  <span className="text-xs font-mono font-bold text-white/80">
                    {job?.progressPercent || 0}%
                  </span>
                </div>

                {/* Meter track */}
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden relative">
                  <motion.div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isCompleted
                        ? 'bg-emerald-500'
                        : isPaused
                        ? 'bg-amber-500'
                        : isError
                        ? 'bg-red-500'
                        : 'bg-gradient-to-r from-blue-500 to-cyan-400'
                    }`}
                    style={{ width: `${job?.progressPercent || 0}%` }}
                  />
                </div>

                {/* Transfer Metrics */}
                <div className="flex items-center justify-between text-[10px] font-mono text-white/40">
                  <span>
                    {formatBytes(job?.bytesDownloaded || 0)} / {formatBytes(job?.totalBytes || film.estimatedSizeBytes)}
                  </span>
                  {isDownloading && (
                    <span className="text-cyan-400 font-bold">
                      {job?.speedFormatted} · ETA {job?.etaFormatted}
                    </span>
                  )}
                  {isCompleted && (
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle2 size={10} /> Local Master Stream Active
                    </span>
                  )}
                </div>

                {/* Error banner if any */}
                {job?.error && (
                  <p className="text-[10px] text-red-400 bg-red-500/10 px-3 py-1.5 rounded-xl border border-red-500/20">
                    {job.error}
                  </p>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-2 gap-3">
                  <div className="flex items-center gap-2">
                    {isDownloading ? (
                      <button
                        onClick={() => handlePauseDownload(film.identifier)}
                        className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all border border-amber-500/30"
                      >
                        <Pause size={12} />
                        Pause
                      </button>
                    ) : isCompleted ? (
                      <button
                        onClick={() => setPreviewingFilm(film)}
                        className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all border border-emerald-500/30"
                      >
                        <Play size={12} />
                        Test Local Stream
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStartDownload(film.identifier)}
                        className="px-4 py-2 bg-white text-black hover:bg-white/90 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow"
                      >
                        <Download size={12} />
                        {isPaused ? 'Resume Download' : 'Pull & Ingest'}
                      </button>
                    )}

                    {isError && (
                      <button
                        onClick={() => handleStartDownload(film.identifier)}
                        className="px-3 py-2 bg-red-500/20 text-red-300 hover:bg-red-500/30 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-all"
                      >
                        <RotateCcw size={12} />
                        Retry
                      </button>
                    )}
                  </div>

                  <a
                    href={film.sourcePageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-white/30 hover:text-white flex items-center gap-1 transition-colors"
                  >
                    <span>{film.dataProvider}</span>
                    <ExternalLink size={10} />
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Local Video Stream Preview Modal */}
      <AnimatePresence>
        {previewingFilm && (
          <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 sm:p-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-4xl bg-[#18181b] border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/40">
                <div className="flex items-center gap-3">
                  <Film size={18} className="text-emerald-400" />
                  <div>
                    <h3 className="text-sm font-black uppercase text-white">{previewingFilm.title}</h3>
                    <p className="text-[10px] text-emerald-400 font-mono">
                      Serving Native Stream: /api/admin/film-ingest/stream/{previewingFilm.identifier}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setPreviewingFilm(null)}
                  className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all text-white"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="relative aspect-video bg-black flex items-center justify-center">
                <video
                  controls
                  autoPlay
                  src={`/api/admin/film-ingest/stream/${encodeURIComponent(previewingFilm.identifier)}`}
                  className="w-full h-full object-contain"
                >
                  Your browser does not support the video tag.
                </video>
              </div>

              <div className="p-4 bg-black/20 flex items-center justify-between text-xs text-white/50">
                <span>Direct disk-backed HTML5 stream with HTTP 206 byte-range seeking.</span>
                <span className="text-emerald-400 font-black">Zero external buffering</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminFilmIngestVault;
