// AdminMediaHealth — support console for inspecting and repairing broken user audio files.
//
// A creator can upload a file that "succeeds" but is broken: a truncated master (only the first
// few seconds actually landed), a lying WAV header, a never-transcoded track, or a messy
// double-publish with duplicates. None of that shows in the normal UI. This tab surfaces
// per-file size / duration / encode-health, lets support audition the actual master, ffprobe it
// for the truth, and PROPOSE a replacement file. The replacement is never applied until the
// creator approves it — support can only ever swap the file behind an existing track, never
// create an album, release, or new track.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  HeartPulse, RefreshCw, Search, Play, Pause, Loader2, Music, AlertTriangle,
  CheckCircle2, UploadCloud, FlaskConical, Send, Inbox,
} from 'lucide-react';
import type { Album } from '../../types';
import {
  scanMediaHealth, probeMaster, uploadReplacementFile, requestRepair, listRepairRequests,
  type MediaHealthRow, type ProbeResult, type RepairRequest,
} from '../../services/adminMediaHealth';

const fmtSize = (b: number | null) => b == null ? '—' : b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(2)} MB`;
const fmtDur = (s: number | null | undefined) => s == null ? '—' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

// Flag → severity colour. Danger = broken, warn = suspicious, info = in-progress.
const flagStyle = (f: string): string => {
  if (['EMPTY_ALBUM', 'MISSING_FILE', 'NO_URL', 'NO_TRANSCODE', 'DUPLICATE'].includes(f) || f === 'STREAM_FAILED') return 'bg-red-500/15 text-red-300 border-red-500/30';
  if (['SHORT_DURATION', 'LIKELY_SHORT_FILE', 'SMALL_FILE'].includes(f)) return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  if (f.startsWith('STREAM_')) return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
  return 'bg-white/10 text-white/50 border-white/15';
};

export default function AdminMediaHealth() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loadingAlbums, setLoadingAlbums] = useState(true);
  const [search, setSearch] = useState('');
  const [ownerScan, setOwnerScan] = useState('');

  const [report, setReport] = useState<MediaHealthRow[] | null>(null);
  const [albumFlags, setAlbumFlags] = useState<{ albumId: string; albumTitle: string; flags: string[] }[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanLabel, setScanLabel] = useState('');
  const [error, setError] = useState('');

  const [probeByTrack, setProbeByTrack] = useState<Record<string, ProbeResult | 'loading' | { error: string }>>({});
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [replaceFor, setReplaceFor] = useState<MediaHealthRow | null>(null);
  const [requests, setRequests] = useState<RepairRequest[]>([]);

  // Load music albums for the picker.
  useEffect(() => {
    (async () => {
      setLoadingAlbums(true);
      try {
        const { fetchAllPublicAlbums } = await import('../../services/backendService');
        const all = await fetchAllPublicAlbums();
        const music = (all || []).filter(a => (a as any).type !== 'BOOK' && (a as any).type !== 'PHOTO');
        music.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setAlbums(music);
      } catch (e: any) { setError(`Could not load albums: ${e?.message || e}`); }
      finally { setLoadingAlbums(false); }
    })();
    refreshRequests();
  }, []);

  const refreshRequests = async () => {
    try { setRequests((await listRepairRequests()).requests); } catch { /* non-fatal */ }
  };

  const filteredAlbums = useMemo(() => {
    const q = search.trim().toLowerCase();
    return albums.filter(a => !q || a.title?.toLowerCase().includes(q) || a.artist?.toLowerCase().includes(q)).slice(0, 40);
  }, [albums, search]);

  const runScan = async (scope: { albumId?: string; ownerId?: string }, label: string) => {
    setScanning(true); setScanLabel(label); setError(''); setReport(null); setAlbumFlags([]); setProbeByTrack({});
    try {
      const r = await scanMediaHealth(scope);
      setReport(r.rows);
      setAlbumFlags(r.albumFlags || []);
    } catch (e: any) { setError(`Scan failed: ${e?.message || e}`); }
    finally { setScanning(false); }
  };

  const audition = (row: MediaHealthRow) => {
    if (!row.url) return;
    if (nowPlaying === row.trackId) { audioRef.current?.pause(); setNowPlaying(null); return; }
    setNowPlaying(row.trackId);
    setTimeout(() => { if (audioRef.current) { audioRef.current.src = row.url; audioRef.current.play().catch(() => {}); } }, 0);
  };

  const doProbe = async (row: MediaHealthRow) => {
    setProbeByTrack(m => ({ ...m, [row.trackId]: 'loading' }));
    try { const p = await probeMaster(row.url); setProbeByTrack(m => ({ ...m, [row.trackId]: p })); }
    catch (e: any) { setProbeByTrack(m => ({ ...m, [row.trackId]: { error: e?.message || String(e) } })); }
  };

  const anyProblem = (report || []).some(r => r.flags.length);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-5xl">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-rose-500/15 flex items-center justify-center">
          <HeartPulse size={18} className="text-rose-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-black">Media Health</h2>
          <p className="text-[11px] text-white/40">Inspect a creator's audio files — size, duration, encode status — audition them, and propose a fix. Replacements apply only after the creator approves.</p>
        </div>
        <button onClick={refreshRequests} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] font-bold text-white/60 transition-colors">
          <RefreshCw size={13} /> Requests
        </button>
      </div>

      {/* Scope controls */}
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find an album or artist to scan…"
            className="w-full bg-white/5 rounded-lg pl-8 pr-3 py-2 text-[12px] text-white/70 outline-none placeholder-white/25" />
        </div>
        <div className="flex gap-2">
          <input value={ownerScan} onChange={e => setOwnerScan(e.target.value)} placeholder="…or a creator UID"
            className="flex-1 bg-white/5 rounded-lg px-3 py-2 text-[12px] text-white/70 outline-none placeholder-white/25 font-mono" />
          <button onClick={() => ownerScan.trim() && runScan({ ownerId: ownerScan.trim() }, `creator ${ownerScan.trim().slice(0, 8)}…`)}
            disabled={scanning || !ownerScan.trim()}
            className="px-3 py-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-[11px] font-black uppercase tracking-widest text-rose-300 disabled:opacity-40 transition-colors whitespace-nowrap">
            Scan creator
          </button>
        </div>
      </div>

      {/* Album picker */}
      {!report && (
        <div className="rounded-xl border border-white/8 divide-y divide-white/5 overflow-hidden mb-3 max-h-64 overflow-y-auto">
          {loadingAlbums ? (
            <div className="p-6 text-center text-white/30 text-sm"><Loader2 size={16} className="animate-spin mx-auto mb-2" /> Loading catalogue…</div>
          ) : filteredAlbums.length === 0 ? (
            <div className="p-6 text-center text-white/30 text-sm">No matching albums.</div>
          ) : filteredAlbums.map(a => (
            <button key={a.id} onClick={() => runScan({ albumId: a.id }, a.title || a.id)}
              className="w-full flex items-center gap-3 p-2.5 text-left hover:bg-white/[0.03] transition-colors">
              <div className="w-9 h-9 rounded-lg bg-white/5 overflow-hidden shrink-0 flex items-center justify-center">
                {a.coverImage ? <img src={a.coverImage} alt="" className="w-full h-full object-cover" /> : <Music size={14} className="text-white/20" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-bold text-white/80 truncate">{a.title || 'Untitled'}</div>
                <div className="text-[10px] text-white/40 truncate">{a.artist || '—'} · {a.tracks?.length || 0} track{(a.tracks?.length || 0) !== 1 ? 's' : ''}</div>
              </div>
              <FlaskConical size={13} className="text-white/25 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {error && <div className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-[11px] text-red-300">{error}</div>}

      {scanning && (
        <div className="mb-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-3">
          <Loader2 size={16} className="text-rose-400 animate-spin" />
          <div className="text-[11px] font-bold text-rose-300">Scanning {scanLabel}… (checking each file's size + encode status)</div>
        </div>
      )}

      {/* Report */}
      {report && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] font-black uppercase tracking-widest text-white/50">
              {report.length} track{report.length !== 1 ? 's' : ''} · {scanLabel}
              {!anyProblem && report.length > 0 && <span className="ml-2 text-green-400 normal-case tracking-normal">✓ all healthy</span>}
            </div>
            <button onClick={() => { setReport(null); setNowPlaying(null); audioRef.current?.pause(); }} className="text-[11px] font-bold text-white/40 hover:text-white/70">← back</button>
          </div>

          {albumFlags.map(af => (
            <div key={af.albumId} className="mb-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2">
              <AlertTriangle size={13} className="text-red-400 shrink-0" />
              <span className="text-[11px] text-red-200 truncate">"{af.albumTitle || af.albumId}" — {af.flags.join(', ')}</span>
            </div>
          ))}

          <div className="rounded-xl border border-white/8 divide-y divide-white/5 overflow-hidden">
            {report.map(row => {
              const probe = probeByTrack[row.trackId];
              const isPlaying = nowPlaying === row.trackId;
              return (
                <div key={row.trackId} className="p-3">
                  <div className="flex items-center gap-3">
                    <button onClick={() => audition(row)} disabled={!row.url}
                      className="w-8 h-8 rounded-lg bg-white/5 hover:bg-rose-500/20 flex items-center justify-center shrink-0 disabled:opacity-30 transition-colors">
                      {isPlaying ? <Pause size={14} className="text-rose-300" /> : <Play size={14} className="text-white/60" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-bold text-white/80 truncate">{row.trackTitle || row.trackId}</div>
                      <div className="text-[10px] text-white/40 truncate tabular-nums">
                        {fmtSize(row.size)} · {row.contentType || '—'} · stream: {row.streamStatus}
                        {row.durationSec != null && ` · ${fmtDur(row.durationSec)}`}
                        {row.durationSec == null && row.estSeconds != null && ` · ~${fmtDur(row.estSeconds)} est`}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => doProbe(row)} disabled={!row.url || probe === 'loading'}
                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] font-bold text-white/50 disabled:opacity-30 transition-colors">
                        {probe === 'loading' ? <Loader2 size={11} className="animate-spin" /> : <FlaskConical size={11} />} Probe
                      </button>
                      <button onClick={() => setReplaceFor(replaceFor?.trackId === row.trackId ? null : row)}
                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-[10px] font-black uppercase tracking-wide text-amber-300 transition-colors">
                        <UploadCloud size={11} /> Replace
                      </button>
                    </div>
                  </div>

                  {row.flags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2 pl-11">
                      {row.flags.map(f => <span key={f} className={`text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded border ${flagStyle(f)}`}>{f.replace(/_/g, ' ')}</span>)}
                    </div>
                  )}

                  {probe && probe !== 'loading' && (
                    <div className="mt-2 pl-11 text-[10px] font-mono text-white/50">
                      {'error' in probe
                        ? <span className="text-red-400">probe error: {probe.error}</span>
                        : <span>ffprobe: <b className="text-white/70">{fmtDur(probe.durationSec)}</b> ({probe.durationSec.toFixed(1)}s) · {probe.formatName} · {probe.codec} · {probe.sampleRate ? `${probe.sampleRate}Hz` : ''} {probe.channels ? `${probe.channels}ch` : ''} {probe.bitRate ? `· ${Math.round(probe.bitRate / 1000)}kbps` : ''}</span>}
                    </div>
                  )}

                  {replaceFor?.trackId === row.trackId && (
                    <ReplacePanel row={row} onDone={() => { setReplaceFor(null); refreshRequests(); }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Requests ledger */}
      {requests.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-white/30 mb-1.5">
            <Inbox size={11} /> Repair requests
          </div>
          <div className="rounded-xl border border-white/8 divide-y divide-white/5 overflow-hidden">
            {requests.slice(0, 20).map(r => (
              <div key={r.id} className="flex items-center gap-2 px-3 py-2 text-[11px]">
                <span className={`w-2 h-2 rounded-full shrink-0 ${r.status === 'approved' ? 'bg-green-400' : r.status === 'pending' ? 'bg-amber-400' : r.status === 'denied' ? 'bg-white/30' : 'bg-red-400'}`} />
                <span className="text-white/70 truncate flex-1">{r.trackTitle || r.trackId} <span className="text-white/30">· {r.albumTitle}</span></span>
                <span className="text-white/40 uppercase tracking-wide text-[9px] font-black">{r.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hidden audio element powers the audition play/pause. */}
      <audio ref={audioRef} onEnded={() => setNowPlaying(null)} className="hidden" />
    </motion.div>
  );
}

// Inline replace form: upload a corrected master, then send the creator an approval request.
function ReplacePanel({ row, onDone }: { row: MediaHealthRow; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [pct, setPct] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!file) return;
    setBusy(true); setErr('');
    try {
      const newUrl = await uploadReplacementFile(file, setPct);
      await requestRepair({ albumId: row.albumId, trackId: row.trackId, newUrl, note: note.trim() });
      setDone(true);
      setTimeout(onDone, 1400);
    } catch (e: any) { setErr(e?.message || String(e)); }
    finally { setBusy(false); setPct(null); }
  };

  if (done) return (
    <div className="mt-2 ml-11 p-2.5 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center gap-2 text-[11px] text-green-300">
      <CheckCircle2 size={13} /> Sent to the creator for approval. It goes live only if they accept.
    </div>
  );

  return (
    <div className="mt-2 ml-11 p-3 rounded-lg bg-black/30 border border-white/10 space-y-2">
      <div className="text-[10px] text-white/40">Upload the corrected file — the creator is asked to approve before it replaces anything.</div>
      <input type="file" accept="audio/*" onChange={e => setFile(e.target.files?.[0] || null)}
        className="block w-full text-[11px] text-white/60 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-white/10 file:text-white/70 file:text-[10px] file:font-bold" />
      <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Note to the creator (what was wrong, what you're replacing it with)…" rows={2}
        className="w-full bg-white/5 rounded-lg px-2.5 py-2 text-[11px] text-white/70 outline-none placeholder-white/25 resize-none" />
      {err && <div className="text-[10px] text-red-400">{err}</div>}
      <div className="flex items-center gap-2">
        <button onClick={submit} disabled={!file || busy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-[10px] font-black uppercase tracking-widest text-rose-300 disabled:opacity-40 transition-colors">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          {pct != null ? `Uploading ${pct}%` : 'Send for approval'}
        </button>
      </div>
    </div>
  );
}
