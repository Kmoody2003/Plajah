import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Wrench, RefreshCw, ChevronDown, ChevronUp, Zap, FileAudio, Music } from 'lucide-react';
import { Album } from '../types';
import {
  scanAlbumCompatibility,
  convertTrackForBrowser,
  type TrackCompatReport,
  type ConversionProgress,
} from '../services/audioConversionService';

interface Props {
  albums: Album[];
  onAlbumUpdated?: (albumId: string) => void;
}

interface AlbumScan {
  album: Album;
  reports: TrackCompatReport[];
  scanned: boolean;
  scanning: boolean;
}

interface TrackConvertState {
  key: string; // `${albumId}/${trackId}`
  progress: ConversionProgress | null;
  error: string | null;
}

export default function AudioHealthPanel({ albums, onAlbumUpdated }: Props) {
  const [scans, setScans] = useState<AlbumScan[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [converting, setConverting] = useState<Map<string, TrackConvertState>>(new Map());
  const [scanningAll, setScanningAll] = useState(false);

  // Initialize scan states from albums
  useEffect(() => {
    setScans(albums.map(a => ({ album: a, reports: [], scanned: false, scanning: false })));
  }, [albums]);

  const totalProblems = scans.reduce((n, s) => n + s.reports.filter(r => r.needsConversion).length, 0);
  const totalScanned = scans.filter(s => s.scanned).length;

  const scanAlbum = useCallback(async (albumId: string) => {
    setScans(prev => prev.map(s => s.album.id === albumId ? { ...s, scanning: true } : s));
    const scan = scans.find(s => s.album.id === albumId);
    if (!scan) return;
    try {
      const reports = await scanAlbumCompatibility(scan.album);
      setScans(prev => prev.map(s => s.album.id === albumId ? { ...s, reports, scanned: true, scanning: false } : s));
      if (reports.some(r => r.needsConversion)) {
        setExpanded(prev => new Set([...prev, albumId]));
      }
    } catch (e) {
      setScans(prev => prev.map(s => s.album.id === albumId ? { ...s, scanning: false } : s));
    }
  }, [scans]);

  const scanAll = useCallback(async () => {
    setScanningAll(true);
    for (const scan of scans) {
      if (!scan.scanned && !scan.scanning) {
        await scanAlbum(scan.album.id);
      }
    }
    setScanningAll(false);
  }, [scans, scanAlbum]);

  const convertTrack = useCallback(async (report: TrackCompatReport) => {
    const key = `${report.albumId}/${report.track.id}`;
    const scan = scans.find(s => s.album.id === report.albumId);
    if (!scan) return;

    setConverting(prev => new Map(prev).set(key, { key, progress: { stage: 'fetching', pct: 0, message: 'Starting…' }, error: null }));

    try {
      await convertTrackForBrowser(report.track, scan.album, (p) => {
        setConverting(prev => new Map(prev).set(key, { key, progress: p, error: null }));
      });
      // Mark as fixed in local scan state
      setScans(prev => prev.map(s => {
        if (s.album.id !== report.albumId) return s;
        return { ...s, reports: s.reports.map(r => r.track.id === report.track.id ? { ...r, needsConversion: false, reason: 'Converted to browser-compatible WAV' } : r) };
      }));
      onAlbumUpdated?.(report.albumId);
    } catch (e: any) {
      setConverting(prev => new Map(prev).set(key, { key, progress: null, error: e?.message ?? 'Conversion failed' }));
    }
  }, [scans, onAlbumUpdated]);

  const convertAllInAlbum = useCallback(async (albumId: string) => {
    const scan = scans.find(s => s.album.id === albumId);
    if (!scan) return;
    for (const report of scan.reports.filter(r => r.needsConversion)) {
      await convertTrack(report);
    }
  }, [scans, convertTrack]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none text-white">
            Audio<br />Health
          </h1>
          <p className="text-white/30 text-sm font-bold uppercase tracking-widest mt-2">
            Detect · Convert · Fix problem tracks
          </p>
        </div>
        <button
          onClick={scanAll}
          disabled={scanningAll}
          className="flex items-center gap-2.5 px-7 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, rgba(107,0,153,0.3), rgba(255,140,0,0.2))', border: '1px solid rgba(255,140,0,0.25)', color: '#fff' }}
        >
          {scanningAll ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
          {scanningAll ? 'Scanning…' : 'Scan All Albums'}
        </button>
      </div>

      {/* Summary banner */}
      {totalScanned > 0 && (
        <div className={`flex items-center gap-4 p-5 rounded-2xl border ${totalProblems > 0 ? 'border-orange-500/30 bg-orange-500/8' : 'border-green-500/20 bg-green-500/5'}`}>
          {totalProblems > 0
            ? <AlertTriangle size={20} className="text-orange-400 shrink-0" />
            : <CheckCircle2 size={20} className="text-green-400 shrink-0" />
          }
          <div>
            <p className="text-sm font-black uppercase tracking-widest" style={{ color: totalProblems > 0 ? '#fb923c' : '#4ade80' }}>
              {totalProblems > 0 ? `${totalProblems} problem track${totalProblems !== 1 ? 's' : ''} found` : 'All scanned tracks are browser-compatible'}
            </p>
            <p className="text-[10px] text-white/30 mt-0.5">
              {totalScanned} of {scans.length} albums scanned
              {totalProblems > 0 && ' · Original files are never deleted — a browser-optimized copy is created'}
            </p>
          </div>
        </div>
      )}

      {/* Album list */}
      <div className="space-y-3">
        {scans.map(scan => {
          const problems = scan.reports.filter(r => r.needsConversion);
          const isExpanded = expanded.has(scan.album.id);

          return (
            <div key={scan.album.id} className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden">
              {/* Album row */}
              <div className="flex items-center gap-4 p-5">
                {/* Cover */}
                <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-white/5">
                  {scan.album.coverImage
                    ? <img src={scan.album.coverImage} className="w-full h-full object-cover" alt="" />
                    : <div className="w-full h-full flex items-center justify-center"><Music size={16} className="text-white/20" /></div>
                  }
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black uppercase tracking-widest text-white truncate">{scan.album.title}</p>
                  <p className="text-[10px] text-white/30">
                    {scan.album.tracks?.length ?? 0} tracks
                    {scan.scanned && problems.length === 0 && <span className="text-green-400 ml-2">✓ All compatible</span>}
                    {scan.scanned && problems.length > 0 && <span className="text-orange-400 ml-2">{problems.length} issue{problems.length !== 1 ? 's' : ''}</span>}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {!scan.scanned && (
                    <button
                      onClick={() => scanAlbum(scan.album.id)}
                      disabled={scan.scanning}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white border border-white/8 hover:border-white/20 transition-all disabled:opacity-40"
                    >
                      {scan.scanning ? <RefreshCw size={11} className="animate-spin" /> : <Zap size={11} />}
                      {scan.scanning ? 'Scanning' : 'Scan'}
                    </button>
                  )}
                  {scan.scanned && problems.length > 0 && (
                    <button
                      onClick={() => convertAllInAlbum(scan.album.id)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                      style={{ background: 'rgba(255,140,0,0.15)', border: '1px solid rgba(255,140,0,0.3)', color: '#fb923c' }}
                    >
                      <Wrench size={11} />
                      Fix All
                    </button>
                  )}
                  {scan.scanned && (
                    <button onClick={() => toggleExpand(scan.album.id)} className="p-2 text-white/30 hover:text-white transition-colors">
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  )}
                </div>
              </div>

              {/* Track list */}
              <AnimatePresence>
                {isExpanded && scan.scanned && (
                  <motion.div
                    key="tracks"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden border-t border-white/5"
                  >
                    <div className="p-3 space-y-1.5">
                      {scan.reports.map((report, idx) => {
                        const key = `${report.albumId}/${report.track.id}`;
                        const state = converting.get(key);
                        const isDone = !report.needsConversion || (state?.progress?.stage === 'done');

                        return (
                          <div key={report.track.id}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl ${report.needsConversion && !isDone ? 'bg-orange-500/6 border border-orange-500/15' : 'border border-transparent'}`}
                          >
                            {/* Track number */}
                            <span className="text-[9px] font-black text-white/20 w-5 text-right shrink-0">{idx + 1}</span>

                            {/* Icon */}
                            <div className="shrink-0">
                              {isDone
                                ? <CheckCircle2 size={14} className="text-green-400" />
                                : report.needsConversion
                                  ? <AlertTriangle size={14} className="text-orange-400" />
                                  : <CheckCircle2 size={14} className="text-white/20" />
                              }
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-bold text-white truncate">{report.track.title}</p>
                              <p className="text-[9px] text-white/30 truncate">
                                {isDone && state?.progress?.stage === 'done'
                                  ? 'Converted to browser-compatible WAV · Original preserved'
                                  : report.reason
                                }
                              </p>
                              {/* Progress bar */}
                              {state?.progress && state.progress.stage !== 'done' && (
                                <div className="mt-1.5">
                                  <div className="h-1 bg-white/8 rounded-full overflow-hidden">
                                    <motion.div
                                      className="h-full rounded-full"
                                      style={{ background: 'linear-gradient(90deg, #6b0099, #FF8C00)' }}
                                      animate={{ width: `${state.progress.pct}%` }}
                                      transition={{ duration: 0.3 }}
                                    />
                                  </div>
                                  <p className="text-[8px] text-white/30 mt-0.5">{state.progress.message}</p>
                                </div>
                              )}
                              {state?.error && (
                                <p className="text-[9px] text-red-400 mt-0.5">{state.error}</p>
                              )}
                            </div>

                            {/* Format badge */}
                            {!state?.progress && (
                              <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-lg shrink-0 ${
                                report.needsConversion && !isDone
                                  ? 'bg-orange-500/15 text-orange-400'
                                  : 'bg-white/5 text-white/30'
                              }`}>
                                {report.formatName || '—'}
                                {report.bitsPerSample ? ` ${report.bitsPerSample}-bit` : ''}
                              </span>
                            )}

                            {/* Fix button */}
                            {report.needsConversion && !isDone && !state?.progress && (
                              <button
                                onClick={() => convertTrack(report)}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all shrink-0"
                                style={{ background: 'rgba(255,140,0,0.12)', border: '1px solid rgba(255,140,0,0.25)', color: '#fb923c' }}
                              >
                                <Wrench size={10} /> Fix
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        {scans.length === 0 && (
          <div className="p-12 rounded-2xl border border-dashed border-white/8 text-center">
            <FileAudio size={32} className="text-white/10 mx-auto mb-3" />
            <p className="text-[10px] font-black uppercase tracking-widest text-white/20">No albums yet</p>
            <p className="text-[9px] text-white/12 mt-1">Upload music to see your audio health report</p>
          </div>
        )}
      </div>

      {/* Info box */}
      <div className="p-5 rounded-2xl border border-white/5 bg-white/[0.015] text-[10px] text-white/30 space-y-1">
        <p className="font-black uppercase tracking-widest text-white/50">How it works</p>
        <p>Problem formats (24-bit WAV, 32-bit float, AIFF, etc.) are decoded and re-encoded as 16-bit PCM WAV — the universal browser audio format.</p>
        <p>Your original high-resolution file is <span className="text-white/60 font-bold">never deleted</span> — it stays in storage as a backup. Only the playback URL is swapped for the browser-optimized copy.</p>
        <p>Converted files are stored at <span className="text-white/50 font-mono">converted/{'{userId}'}/{'{albumId}'}/*.wav</span> in your storage.</p>
      </div>
    </motion.div>
  );
}
