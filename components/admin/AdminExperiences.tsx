// AdminExperiences — the platform-admin-only "Experiences" asset area: the Dossier films, hosted on Mux.
//
// Who can see and use this: platform admins only. The Firestore rules (`experiences` = isAdmin() read/write) are the
// real gate; if the signed-in account is not an admin the list fails and this tab says so instead of showing an empty
// shelf. Visitors never read this collection: "Use in the hall" copies just the playback fields to the public
// `experienceFilms/{exhibitId}` doc, and "Publish as Reello video" creates an ordinary Reello video (private by default).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clapperboard, RefreshCw, UploadCloud, Captions, Play, Landmark, Film, Loader2, AlertTriangle, CheckCircle2, FileJson, EyeOff, Eye, ChevronDown } from 'lucide-react';
import { DOSSIERS } from '../../data/dossier/registry';
import {
  EXPERIENCE_CATALOG, hallBlockers, posterUrl, reelloBlockers, type ExperienceRecord, type ExperienceStatus,
} from '../../services/dossier/experiences/experienceModel';
import {
  attachCaptions, importManifest, listExperiences, publishAsReello, refreshExperience, removeFromHall, setReelloVisibility, uploadExperience, putInHall,
} from '../../services/dossier/experiences/experienceService';
import { db } from '../../services/firebase';
import { doc, getDoc } from 'firebase/firestore';

const MuxPlayer = React.lazy(() => import('@mux/mux-player-react'));

const fmtDur = (s?: number) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '—');
const fmtMb = (b?: number) => (b ? `${(b / 1048576).toFixed(1)} MB` : '—');
const STATUS_STYLE: Record<ExperienceStatus | 'missing', string> = {
  missing: 'bg-white/5 text-white/40 border-white/10',
  planned: 'bg-white/5 text-white/50 border-white/10',
  uploading: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  processing: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  ready: 'bg-green-500/15 text-green-300 border-green-500/30',
  errored: 'bg-red-500/15 text-red-300 border-red-500/30',
};
const chip = (cls: string, text: string) => <span className={`px-2 py-0.5 rounded-md border text-[10px] font-black uppercase tracking-widest ${cls}`}>{text}</span>;
const btn = 'px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] font-black uppercase tracking-widest text-white/70 disabled:opacity-35 disabled:hover:bg-white/5 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap';
const btnPrimary = 'px-3 py-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-[11px] font-black uppercase tracking-widest text-rose-300 disabled:opacity-35 disabled:hover:bg-rose-500/20 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap';

interface Row { id: string; rec?: ExperienceRecord; title: string; exhibitId: string; variant: string; file: string; legacy?: boolean }

const AdminExperiences: React.FC = () => {
  const [records, setRecords] = useState<ExperienceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<string | null>(null);
  const [showLegacy, setShowLegacy] = useState(false);
  const [reelloVis, setReelloVis] = useState<Record<string, 'private' | 'public'>>({});
  const [reelloState, setReelloState] = useState<Record<string, boolean | undefined>>({});   // id -> isPrivate of the published video
  const manifestInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setDenied(null);
    try { setRecords(await listExperiences()); }
    catch (e: any) {
      const code = e?.code || '';
      setDenied(code.includes('permission') ? 'This account is not a platform admin (or the experiences rules have not been deployed yet), so Firestore refused the read.' : `Could not load experiences: ${e?.message || e}`);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Which published Reello videos are currently private/public (for the toggle label).
  useEffect(() => {
    let live = true;
    (async () => {
      const out: Record<string, boolean | undefined> = {};
      for (const r of records) if (r.publishedReelloId) {
        try { const s = await getDoc(doc(db, 'videos', r.publishedReelloId)); out[r.id] = s.exists() ? !!(s.data() as any).isPrivate : undefined; } catch { /* ignore */ }
      }
      if (live) setReelloState(out);
    })();
    return () => { live = false; };
  }, [records]);

  const rows: Row[] = useMemo(() => EXPERIENCE_CATALOG.map(c => ({
    id: c.id, title: c.title, exhibitId: c.exhibitId, variant: c.variant, file: c.file, legacy: c.legacy, rec: records.find(r => r.id === c.id),
  })), [records]);
  const exhibitTitle = (id: string) => DOSSIERS.find(d => d.id === id)?.title || id;

  const replace = (next: ExperienceRecord) => setRecords(rs => (rs.some(r => r.id === next.id) ? rs.map(r => (r.id === next.id ? next : r)) : [...rs, next]));
  const run = async (id: string, label: string, fn: () => Promise<ExperienceRecord | void>, okText: string) => {
    setBusy(b => ({ ...b, [id]: label })); setMsg(null);
    try { const next = await fn(); if (next) replace(next); setMsg({ kind: 'ok', text: okText }); }
    catch (e: any) { setMsg({ kind: 'err', text: `${label}: ${e?.message || e}` }); }
    finally { setBusy(b => { const { [id]: _, ...rest } = b; return rest; }); }
  };

  const onUpload = (row: Row, file?: File | null) => {
    if (!file) return;
    if (!/^video\//.test(file.type) && !/\.mp4$/i.test(file.name)) { setMsg({ kind: 'err', text: 'Choose an MP4 video file.' }); return; }
    if (row.rec?.muxAssetId && !window.confirm('This slot already has a Mux asset. Uploading creates a NEW asset and leaves the old one in Mux (delete it there to stop storage charges). Continue?')) return;
    run(row.id, 'Upload', () => uploadExperience({ slotId: row.id, file, existing: row.rec, onProgress: p => setProgress(s => ({ ...s, [row.id]: p })) }),
      'Uploaded to Mux. It will show as ready once Mux finishes transcoding; press Refresh to check.');
  };

  const onManifest = async (file?: File | null) => {
    if (!file) return;
    setMsg(null);
    try {
      const n = await importManifest(JSON.parse(await file.text()), records);
      await load();
      setMsg({ kind: 'ok', text: `Imported ${n} experience record${n === 1 ? '' : 's'} from the manifest. Press Refresh on each to read its final status from Mux.` });
    } catch (e: any) { setMsg({ kind: 'err', text: `Import manifest: ${e?.message || e}` }); }
  };

  const renderRow = (row: Row) => {
    const rec = row.rec;
    const status: ExperienceStatus | 'missing' = rec?.status || 'missing';
    const working = busy[row.id];
    const hb = rec ? hallBlockers(rec) : ['Not uploaded yet.'];
    const rb = rec ? reelloBlockers(rec) : ['Not uploaded yet.'];
    const hasCanvasFilm = !!DOSSIERS.find(d => d.id === row.exhibitId)?.film;
    const vis = reelloVis[row.id] || 'private';
    const published = rec?.publishedReelloId;
    const isPrivate = reelloState[row.id];
    return (
      <div key={row.id} className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
        <div className="flex gap-4">
          <div className="w-40 aspect-video rounded-lg bg-white/5 overflow-hidden shrink-0 flex items-center justify-center">
            {rec?.muxPlaybackId
              ? <img src={posterUrl(rec.muxPlaybackId, 5, 480)} alt="" loading="lazy" className="w-full h-full object-cover" />
              : <Film size={22} className="text-white/20" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <div className="text-[13px] font-bold text-white/90 truncate">{rec?.title || row.title}</div>
              {chip(STATUS_STYLE[status], status === 'missing' ? 'not uploaded' : status)}
              {chip('bg-white/5 text-white/50 border-white/10', row.variant)}
              {rec?.playbackPolicy && chip(rec.playbackPolicy === 'public' ? 'bg-white/5 text-white/50 border-white/10' : 'bg-amber-500/15 text-amber-300 border-amber-500/30', rec.playbackPolicy)}
              {rec?.inHall && chip('bg-rose-500/15 text-rose-300 border-rose-500/30', 'in the hall')}
              {published && chip(isPrivate === false ? 'bg-green-500/15 text-green-300 border-green-500/30' : 'bg-white/5 text-white/50 border-white/10', isPrivate === false ? 'reello: public' : 'reello: private')}
              {rec?.captionsUrl && chip('bg-white/5 text-white/50 border-white/10', 'captions')}
            </div>
            <div className="text-[11px] text-white/45 tabular-nums">
              {exhibitTitle(row.exhibitId)} · {fmtDur(rec?.durationSec)} · {rec?.width && rec?.height ? `${rec.width}×${rec.height}` : '—'} · {fmtMb(rec?.sizeBytes)} · {row.file}
              {rec?.renderedAt ? ` · rendered ${new Date(rec.renderedAt).toLocaleDateString()}` : ''}
            </div>
            {rec?.error && <div className="mt-1 text-[11px] text-red-300 flex items-center gap-1"><AlertTriangle size={12} /> {rec.error}</div>}
            {!hasCanvasFilm && rec && <div className="mt-1 text-[10px] text-white/35">This exhibit has no live canvas film; if put in the hall, the Mux film is the only one.</div>}
            {working && <div className="mt-2 text-[11px] text-rose-300 flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> {working}{working === 'Upload' && progress[row.id] != null ? ` ${Math.round(progress[row.id])}%` : ''}…</div>}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className={`${btnPrimary} cursor-pointer ${working ? 'opacity-35 pointer-events-none' : ''}`}>
                <UploadCloud size={13} /> {rec?.muxAssetId ? 'Replace file' : 'Upload'}
                <input type="file" accept="video/mp4,video/*" className="hidden" onChange={e => { onUpload(row, e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              <button className={btn} disabled={!rec || !!working} onClick={() => run(row.id, 'Refresh', () => refreshExperience(rec!), 'Refreshed from Mux.')}><RefreshCw size={13} /> Refresh</button>
              <button className={btn} disabled={!rec?.muxPlaybackId} onClick={() => setPreview(p => (p === row.id ? null : row.id))}><Play size={13} /> {preview === row.id ? 'Hide preview' : 'Preview'}</button>
              <label className={`${btn} cursor-pointer ${!rec || working ? 'opacity-35 pointer-events-none' : ''}`} title="A .vtt, or an .srt (converted to WebVTT)">
                <Captions size={13} /> {rec?.captionsUrl ? 'Replace captions' : 'Attach captions'}
                <input type="file" accept=".vtt,.srt,text/vtt" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f && rec) run(row.id, 'Attach captions', () => attachCaptions(rec, f), 'Captions attached.'); }} />
              </label>
              {rec?.inHall
                ? <button className={btn} disabled={!!working} onClick={() => run(row.id, 'Remove from hall', () => removeFromHall(rec), 'Removed from the hall: visitors get the live canvas film again.')}><Landmark size={13} /> Remove from hall</button>
                : <button className={btn} disabled={!rec || hb.length > 0 || !!working} title={hb.join(' ')} onClick={() => run(row.id, 'Use in hall', () => putInHall(rec!), 'In the hall: visitors of this exhibit now watch the Mux film (the live canvas film stays as the fallback).')}><Landmark size={13} /> Use in hall</button>}
            </div>

            {rec && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {!published ? (
                  <>
                    <select value={vis} onChange={e => setReelloVis(v => ({ ...v, [row.id]: e.target.value as any }))} className="px-2 py-2 rounded-lg bg-white/5 text-[11px] font-bold text-white/70 border border-white/10">
                      <option value="private">Private (only you)</option>
                      <option value="public">Public on Reello</option>
                    </select>
                    <button className={btn} disabled={rb.length > 0 || !!working} title={rb.join(' ')}
                      onClick={() => {
                        if (vis === 'public' && !window.confirm('Publish this film PUBLICLY on Reello? Anyone can watch it and it can appear in feeds.')) return;
                        run(row.id, 'Publish to Reello', () => publishAsReello(rec, vis), vis === 'public' ? 'Published publicly on Reello.' : 'Created as a PRIVATE Reello video. Use the toggle to make it public when you are ready.');
                      }}><Clapperboard size={13} /> Publish as Reello video</button>
                  </>
                ) : (
                  <button className={btn} disabled={!!working} onClick={() => {
                    const next = isPrivate === false ? 'private' : 'public';
                    if (next === 'public' && !window.confirm('Make this Reello video PUBLIC? Anyone can watch it and it can appear in feeds.')) return;
                    run(row.id, 'Reello visibility', async () => { await setReelloVisibility(rec, next); setReelloState(s => ({ ...s, [row.id]: next === 'private' })); }, next === 'public' ? 'Reello video is now public.' : 'Reello video is now private.');
                  }}>{isPrivate === false ? <EyeOff size={13} /> : <Eye size={13} />} {isPrivate === false ? 'Make Reello video private' : 'Make Reello video public'}</button>
                )}
                {!published && rb.length > 0 && <span className="text-[10px] text-white/35">{rb[0]}</span>}
                {!rec.inHall && hb.length > 0 && rec.status === 'ready' && <span className="text-[10px] text-white/35">{hb[0]}</span>}
              </div>
            )}

            {preview === row.id && rec?.muxPlaybackId && (
              <div className="mt-3 rounded-lg overflow-hidden bg-black max-w-2xl">
                <React.Suspense fallback={<div className="p-6 text-center text-white/40 text-sm">Loading player…</div>}>
                  <MuxPlayer playbackId={rec.muxPlaybackId} streamType="on-demand" title={rec.title} crossOrigin="anonymous" style={{ width: '100%', aspectRatio: '16 / 9' }}>
                    {rec.captionsUrl && <track kind="subtitles" src={rec.captionsUrl} srcLang="en" label="English" default />}
                  </MuxPlayer>
                </React.Suspense>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const main = rows.filter(r => !r.legacy);
  const legacy = rows.filter(r => r.legacy);

  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-3"><Clapperboard size={22} className="text-rose-400" /> Experiences</h2>
          <p className="text-[12px] text-white/45 mt-1 max-w-2xl">
            Dossier films hosted on Mux. Admin-only: visitors never see this list. "Use in the hall" shows a film to every visitor of its exhibit
            (the live canvas film stays as the fallback). "Publish as Reello video" makes an ordinary Reello video, private until you make it public.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button className={btn} onClick={() => manifestInput.current?.click()} title="data/dossier/experiences-manifest.json, written by scripts/dossier/uploadExperiences.ts"><FileJson size={13} /> Import manifest</button>
          <input ref={manifestInput} type="file" accept="application/json,.json" className="hidden" onChange={e => { onManifest(e.target.files?.[0]); e.target.value = ''; }} />
          <button className={btn} onClick={load} disabled={loading}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Reload</button>
        </div>
      </div>

      {msg && (
        <div className={`mb-4 p-3 rounded-xl border text-[11px] flex items-start gap-2 ${msg.kind === 'ok' ? 'bg-green-500/10 border-green-500/20 text-green-200' : 'bg-red-500/10 border-red-500/20 text-red-300'}`}>
          {msg.kind === 'ok' ? <CheckCircle2 size={14} className="shrink-0 mt-px" /> : <AlertTriangle size={14} className="shrink-0 mt-px" />} {msg.text}
        </div>
      )}
      {denied && <div className="mb-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[12px] text-amber-200 flex gap-2"><AlertTriangle size={15} className="shrink-0 mt-0.5" /> {denied}</div>}

      {loading ? (
        <div className="p-10 text-center text-white/30 text-sm"><Loader2 size={16} className="animate-spin mx-auto mb-2" /> Loading…</div>
      ) : (
        <div className="space-y-3">
          {main.map(renderRow)}
          <button className="text-[11px] font-black uppercase tracking-widest text-white/40 hover:text-white/70 inline-flex items-center gap-1.5 pt-2" onClick={() => setShowLegacy(v => !v)}>
            <ChevronDown size={13} className={showLegacy ? 'rotate-180 transition-transform' : 'transition-transform'} /> Older explainers ({legacy.length}), not used in the hall
          </button>
          {showLegacy && legacy.map(renderRow)}
        </div>
      )}
    </div>
  );
};

export default AdminExperiences;
