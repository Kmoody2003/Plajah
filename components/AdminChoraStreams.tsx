// AdminChoraStreams — the admin console panel for the Chora transcode pipeline.
//
// Pick an album and run the backfill: each track is transcoded (loudnorm -14 LUFS → AAC-LC 256 HLS +
// data-saver + FLAC) on the Cloud Run worker and its choraStreams/{trackId} doc is written. New uploads
// already auto-enqueue on publish; this is for the back-catalogue uploaded before the pipeline existed.
//
// The transcode endpoint is synchronous (each track finishes before the next), so a run is naturally
// serialized and safe — it can't stampede the server. Keep the tab open while it runs. Re-runnable:
// tracks already 'ready'/'processing' are skipped, so you can stop and resume any time.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  AudioLines, RefreshCw, Play, Search, CheckCircle2, XCircle,
  Loader2, Radio, Music, Square, ListChecks,
} from 'lucide-react';
import type { Album } from '../types';
import {
  enqueueTranscode, refreshTrackStream, type ChoraStream,
} from '../services/choraStreamService';

type TrackStatus = 'unknown' | 'none' | 'processing' | 'ready' | 'failed' | 'skipped';

interface AlbumRow {
  album: Album;
  trackCount: number;
  readyCount: number;
}

const statusColor: Record<TrackStatus, string> = {
  unknown: 'text-white/30', none: 'text-white/40', processing: 'text-amber-400',
  ready: 'text-green-400', failed: 'text-red-400', skipped: 'text-blue-400',
};

export default function AdminChoraStreams() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [running, setRunning] = useState(false);
  const cancelRef = useRef(false);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [trackStatus, setTrackStatus] = useState<Record<string, TrackStatus>>({});
  const [readyByAlbum, setReadyByAlbum] = useState<Record<string, number>>({});
  const [log, setLog] = useState<string[]>([]);

  const pushLog = (line: string) => setLog(l => [`${new Date().toLocaleTimeString()}  ${line}`, ...l].slice(0, 200));

  // Load all public music albums (skip books / non-audio).
  const load = async () => {
    setLoading(true);
    try {
      const { fetchAllPublicAlbums } = await import('../services/backendService');
      const all = await fetchAllPublicAlbums();
      const music = (all || []).filter(a => (a as any).type !== 'BOOK' && Array.isArray(a.tracks) && a.tracks.length > 0);
      music.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setAlbums(music);
    } catch (e: any) {
      pushLog(`Failed to load albums: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const rows: AlbumRow[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    return albums
      .filter(a => !q || a.title?.toLowerCase().includes(q) || a.artist?.toLowerCase().includes(q))
      .map(a => ({
        album: a,
        trackCount: a.tracks?.length || 0,
        readyCount: readyByAlbum[a.id] ?? -1, // -1 = not yet checked
      }));
  }, [albums, search, readyByAlbum]);

  const selected = albums.find(a => a.id === selectedId) || null;

  // Poll current stream status for one album's tracks (no transcoding) — the "Check status" action.
  const checkAlbum = async (album: Album) => {
    let ready = 0;
    for (const t of album.tracks || []) {
      if (!t?.id) continue;
      const s = await refreshTrackStream(t.id).catch(() => null);
      const st: TrackStatus = !s ? 'none' : (s.status as TrackStatus);
      setTrackStatus(m => ({ ...m, [t.id!]: st }));
      if (s?.status === 'ready') ready++;
    }
    setReadyByAlbum(m => ({ ...m, [album.id]: ready }));
    return ready;
  };

  // Backfill one album: transcode every track that isn't already ready. Sequential + live status.
  const backfillAlbum = async (album: Album, indexLabel = '') => {
    const tracks = (album.tracks || []).filter(t => t?.id && typeof t.url === 'string' && /^https?:/i.test(t.url));
    let done = 0;
    for (const t of tracks) {
      if (cancelRef.current) break;
      setProgress({ done, total: tracks.length, label: `${indexLabel}${album.title} — ${t.title || t.id}` });
      const cur = await refreshTrackStream(t.id!).catch(() => null);
      if (cur?.status === 'ready') {
        setTrackStatus(m => ({ ...m, [t.id!]: 'skipped' }));
        done++; continue;
      }
      setTrackStatus(m => ({ ...m, [t.id!]: 'processing' }));
      const ok = await enqueueTranscode(t.id!, t.url as string);
      const after = await refreshTrackStream(t.id!).catch(() => null);
      const st: TrackStatus = after?.status === 'ready' ? 'ready' : after?.status === 'failed' ? 'failed' : (ok ? 'processing' : 'failed');
      setTrackStatus(m => ({ ...m, [t.id!]: st }));
      pushLog(`${st === 'ready' ? '✓' : st === 'failed' ? '✗' : '…'} ${album.title} — ${t.title || t.id} → ${st}`);
      done++;
    }
    await checkAlbum(album);
    return done;
  };

  const runOne = async (album: Album) => {
    if (running) return;
    cancelRef.current = false;
    setRunning(true);
    pushLog(`Backfill started: "${album.title}" (${album.tracks?.length || 0} tracks)`);
    try {
      await backfillAlbum(album);
      pushLog(cancelRef.current ? `Stopped: "${album.title}"` : `Done: "${album.title}"`);
    } catch (e: any) {
      pushLog(`Error on "${album.title}": ${e?.message || e}`);
    } finally {
      setRunning(false); setProgress(null);
    }
  };

  const runAll = async () => {
    if (running) return;
    cancelRef.current = false;
    setRunning(true);
    const list = rows.map(r => r.album);
    pushLog(`Catalog backfill started: ${list.length} albums. Keep this tab open.`);
    try {
      for (let i = 0; i < list.length; i++) {
        if (cancelRef.current) break;
        await backfillAlbum(list[i], `(${i + 1}/${list.length}) `);
      }
      pushLog(cancelRef.current ? 'Catalog backfill stopped.' : 'Catalog backfill complete.');
    } catch (e: any) {
      pushLog(`Catalog backfill error: ${e?.message || e}`);
    } finally {
      setRunning(false); setProgress(null);
    }
  };

  const stop = () => { cancelRef.current = true; pushLog('Stopping after the current track…'); };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-small-orange/15 flex items-center justify-center">
          <AudioLines size={18} className="text-small-orange" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-black">Chora Streaming — Transcode Backfill</h2>
          <p className="text-[11px] text-white/40">Pick an album and run the backfill, or transcode the whole catalog. New uploads auto-transcode on publish.</p>
        </div>
        <button onClick={load} disabled={loading || running}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] font-bold text-white/60 disabled:opacity-40 transition-colors">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Reload
        </button>
      </div>

      {/* Running banner / progress */}
      {(running || progress) && (
        <div className="mb-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
          <Loader2 size={16} className="text-amber-400 animate-spin shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold text-amber-300 truncate">{progress?.label || 'Working…'}</div>
            {progress && <div className="text-[9px] text-amber-300/60">Track {progress.done + 1} of {progress.total} in this album</div>}
          </div>
          <button onClick={stop} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-[10px] font-black uppercase tracking-widest text-red-300 transition-colors">
            <Square size={11} /> Stop
          </button>
        </div>
      )}

      {/* Toolbar: search + backfill-all */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search albums or artists…"
            className="w-full bg-white/5 rounded-lg pl-8 pr-3 py-2 text-[12px] text-white/70 outline-none placeholder-white/25" />
        </div>
        <button onClick={runAll} disabled={running || !rows.length}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-small-orange/20 hover:bg-small-orange/30 text-[11px] font-black uppercase tracking-widest text-small-orange disabled:opacity-40 transition-colors">
          <ListChecks size={13} /> Backfill all ({rows.length})
        </button>
      </div>

      {/* Album list */}
      <div className="rounded-xl border border-white/8 divide-y divide-white/5 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-white/30 text-sm"><Loader2 size={18} className="animate-spin mx-auto mb-2" /> Loading catalog…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-white/30 text-sm">No music albums found.</div>
        ) : rows.map(({ album, trackCount, readyCount }) => {
          const isSel = album.id === selectedId;
          return (
            <div key={album.id} className={`flex items-center gap-3 p-3 transition-colors ${isSel ? 'bg-small-orange/5' : 'hover:bg-white/[0.03]'}`}>
              <button onClick={() => { setSelectedId(isSel ? null : album.id); if (!isSel) checkAlbum(album); }}
                className="flex items-center gap-3 flex-1 min-w-0 text-left">
                <div className="w-10 h-10 rounded-lg bg-white/5 overflow-hidden shrink-0 flex items-center justify-center">
                  {album.coverImage ? <img src={album.coverImage} alt="" className="w-full h-full object-cover" /> : <Music size={16} className="text-white/20" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-bold text-white/80 truncate">{album.title || 'Untitled'}</div>
                  <div className="text-[10px] text-white/40 truncate">{album.artist || '—'} · {trackCount} track{trackCount !== 1 ? 's' : ''}</div>
                </div>
                {readyCount >= 0 && (
                  <div className={`text-[10px] font-black tabular-nums shrink-0 ${readyCount === trackCount ? 'text-green-400' : 'text-white/40'}`}>
                    {readyCount}/{trackCount} streamed
                  </div>
                )}
              </button>
              <button onClick={() => runOne(album)} disabled={running}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-small-orange/20 hover:text-small-orange text-[10px] font-black uppercase tracking-widest text-white/60 disabled:opacity-30 transition-colors shrink-0">
                <Play size={12} /> Backfill
              </button>
            </div>
          );
        })}
      </div>

      {/* Selected album track detail */}
      {selected && (
        <div className="mt-4 rounded-xl border border-white/8 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-white/[0.03] border-b border-white/5">
            <div className="text-[11px] font-black uppercase tracking-widest text-white/50 truncate">{selected.title} — tracks</div>
            <button onClick={() => checkAlbum(selected)} disabled={running}
              className="flex items-center gap-1.5 text-[10px] font-bold text-white/40 hover:text-white/70 disabled:opacity-40 transition-colors">
              <RefreshCw size={11} /> Check status
            </button>
          </div>
          <div className="divide-y divide-white/5 max-h-72 overflow-y-auto">
            {(selected.tracks || []).map(t => {
              const st = (t.id && trackStatus[t.id]) || 'unknown';
              const Icon = st === 'ready' ? CheckCircle2 : st === 'failed' ? XCircle : st === 'processing' ? Loader2 : Radio;
              return (
                <div key={t.id} className="flex items-center gap-3 px-3 py-2">
                  <Icon size={13} className={`${statusColor[st as TrackStatus]} ${st === 'processing' ? 'animate-spin' : ''} shrink-0`} />
                  <div className="text-[11px] text-white/70 truncate flex-1">{t.title || t.id}</div>
                  <div className={`text-[9px] font-black uppercase tracking-widest ${statusColor[st as TrackStatus]}`}>
                    {st === 'skipped' ? 'already ready' : st === 'none' ? 'not transcoded' : st}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Log */}
      {log.length > 0 && (
        <div className="mt-4">
          <div className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1.5">Activity</div>
          <div className="rounded-xl bg-black/40 border border-white/8 p-3 max-h-48 overflow-y-auto font-mono text-[10px] text-white/50 space-y-0.5">
            {log.map((l, i) => <div key={i} className="truncate">{l}</div>)}
          </div>
        </div>
      )}

      <p className="mt-3 text-[10px] text-white/25 leading-relaxed">
        The transcode endpoint is synchronous — each track finishes before the next, so a run is slow but safe.
        Long tracks (&gt;5 min) may hit the Cloud Run 300s timeout and show <span className="text-red-400">failed</span>; just re-run.
      </p>
    </motion.div>
  );
}
