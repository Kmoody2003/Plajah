// PoolSyncSheet — "Add photos from the event".
//
//  1. Pick   — the system picker (multiple; photos + videos). On phones this opens the camera roll.
//  2. Review — we read each file's capture time (EXIF / video header) and GPS, pre-select the ones taken during the
//              event (and, when the viewer may see it, at the venue), and the person deselects anything they like.
//              Each file is Private by default; they can flip any to Public (or all at once).
//  3. Upload — files already in the pool are skipped; location metadata is removed before upload; videos get a
//              poster frame. Uploads are resumable through network blips while the sheet is open.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, Film, Lock, Globe, Check, AlertTriangle, X, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import type { PoolView, ItemVisibility } from '../../services/eventPool/poolCore';
import { IMAGE_MAX_BYTES, VIDEO_MAX_BYTES } from '../../services/eventPool/poolCore';
import {
  prepareFile, releasePrepared, hashFile, uploadPrepared, poolApi, type PreparedMedia, type PoolItemView,
} from '../../services/eventPool/poolClient';

type Step = 'pick' | 'reading' | 'review' | 'uploading' | 'done';
interface RowState { selected: boolean; visibility: ItemVisibility; progress?: number; status?: 'queued' | 'working' | 'done' | 'skipped' | 'failed'; note?: string }

const fmtWhen = (t: number | undefined, tz?: string) => {
  if (!t) return 'No date';
  try { return new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz }); } catch { return new Date(t).toLocaleString(); }
};
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n > 10 * 1024 * 1024 ? 0 : 1)} MB`;

export default function PoolSyncSheet({ pool, onClose, onUploaded }: { pool: PoolView; onClose: () => void; onUploaded: (item: PoolItemView) => void }) {
  const [step, setStep] = useState<Step>('pick');
  const [files, setFiles] = useState<PreparedMedia[]>([]);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [readCount, setReadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<{ stop: boolean; current?: () => void }>({ stop: false });

  useEffect(() => () => releasePrepared(files), [files]);

  const onPick = async (list: FileList | null) => {
    if (!list || !list.length) return;
    setError(null); setStep('reading'); setReadCount(0);
    const picked = Array.from(list).slice(0, 500);
    const out: PreparedMedia[] = [];
    for (const f of picked) {
      out.push(await prepareFile(f, pool));
      setReadCount(out.length);
    }
    out.sort((a, b) => Number(b.match.match) - Number(a.match.match) || (a.takenAt ?? 0) - (b.takenAt ?? 0));
    const next: Record<string, RowState> = {};
    for (const p of out) next[p.key] = { selected: !p.error && p.match.match, visibility: 'private' };
    releasePrepared(files);
    setFiles(out); setRows(next); setStep('review');
  };

  const selected = useMemo(() => files.filter(f => rows[f.key]?.selected && !f.error), [files, rows]);
  const matchedCount = files.filter(f => f.match.match).length;
  const set = (key: string, patch: Partial<RowState>) => setRows(r => ({ ...r, [key]: { ...r[key], ...patch } }));
  const setAll = (patch: (f: PreparedMedia) => Partial<RowState> | null) => setRows(r => { const n = { ...r }; for (const f of files) { const p = patch(f); if (p) n[f.key] = { ...n[f.key], ...p }; } return n; });

  const upload = async () => {
    const queue = selected.slice();
    if (!queue.length) return;
    cancelRef.current = { stop: false };
    setStep('uploading'); setError(null);
    setAll(f => (rows[f.key]?.selected && !f.error ? { status: 'queued', progress: 0, note: undefined } : null));
    // Fingerprint first so files already in the pool are never uploaded twice.
    const hashes = new Map<string, string>();
    for (const f of queue) {
      if (cancelRef.current.stop) break;
      set(f.key, { status: 'working', note: 'Checking…' });
      try { hashes.set(f.key, await hashFile(f.file)); } catch { /* upload will hash again */ }
      set(f.key, { status: 'queued', note: undefined });
    }
    let already = new Set<string>();
    try {
      const all = [...hashes.values()];
      for (let i = 0; i < all.length; i += 400) { const r = await poolApi.check(pool.id, all.slice(i, i + 400)); r.mine.forEach(h => already.add(h)); }
    } catch { already = new Set(); }

    let next = 0;
    const worker = async () => {
      while (!cancelRef.current.stop) {
        const f = queue[next++];
        if (!f) return;
        const h = hashes.get(f.key);
        if (h && already.has(h)) { set(f.key, { status: 'skipped', note: 'Already in your photos' }); continue; }
        const want = rows[f.key]?.visibility || 'private';
        set(f.key, { status: 'working', progress: 0 });
        try {
          const r = await uploadPrepared(pool.id, f, {
            visibility: want, hash: h,
            onProgress: (p, stage) => set(f.key, { progress: p, note: stage === 'preparing' ? 'Removing location…' : stage === 'saving' ? 'Saving…' : undefined }),
            onCancelable: c => { cancelRef.current.current = c; },
          });
          const keptPrivate = want === 'public' && r.item.visibility === 'private';
          set(f.key, { status: r.duplicate ? 'skipped' : 'done', progress: 1, note: r.duplicate ? 'Already in your photos' : keptPrivate ? 'Kept private: we couldn’t remove its location' : undefined });
          if (!r.duplicate) onUploaded(r.item);
        } catch (e: any) {
          set(f.key, { status: 'failed', note: cancelRef.current.stop ? 'Cancelled' : (e?.message || 'Upload failed') });
        }
      }
    };
    await Promise.all([worker(), worker()]);
    setStep('done');
  };

  const cancel = () => { cancelRef.current.stop = true; cancelRef.current.current?.(); };
  const counts = useMemo(() => {
    const c = { done: 0, skipped: 0, failed: 0 };
    for (const f of files) { const s = rows[f.key]?.status; if (s === 'done') c.done++; else if (s === 'skipped') c.skipped++; else if (s === 'failed') c.failed++; }
    return c;
  }, [files, rows]);
  const busy = step === 'reading' || step === 'uploading';

  return (
    <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label="Add photos from the event">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] border border-white/10 bg-[#0d0b12] text-white shadow-2xl sm:rounded-[28px]">
        <header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold">Add photos from the event</h2>
            <p className="truncate text-xs text-white/50">{pool.title}</p>
          </div>
          <button type="button" className="tap rounded-full p-2 text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-30" onClick={onClose} disabled={step === 'uploading'} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {step === 'pick' && (
            <div className="space-y-4 py-6 text-center">
              <ImagePlus size={40} className="mx-auto text-white/40" aria-hidden />
              <p className="text-sm text-white/70">Pick from your camera roll. We’ll pre-select what you took during the event.</p>
              <ul className="mx-auto max-w-md space-y-1 text-left text-xs text-white/50">
                <li>• Everything you add starts <strong className="text-white/80">Private</strong> (only you). Make any of it Public to share with everyone at the event.</li>
                <li>• We remove location data from files before they’re uploaded.</li>
                <li>• Photos up to {IMAGE_MAX_BYTES / 1024 / 1024} MB; videos (MP4, MOV, WebM) up to {VIDEO_MAX_BYTES / 1024 / 1024} MB.</li>
              </ul>
              <Button variant="primary" size="lg" icon={<ImagePlus />} onClick={() => inputRef.current?.click()}>Choose photos and videos</Button>
              <input ref={inputRef} type="file" multiple accept="image/*,video/mp4,video/quicktime,video/webm" className="hidden" onChange={e => { onPick(e.target.files); e.target.value = ''; }} />
            </div>
          )}

          {step === 'reading' && (
            <div className="flex items-center justify-center gap-3 py-12 text-sm text-white/70" role="status">
              <Loader2 size={18} className="animate-spin" aria-hidden /> Reading dates… {readCount}
            </div>
          )}

          {(step === 'review' || step === 'uploading' || step === 'done') && (
            <>
              {step === 'review' && (
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-white/60">
                  <span>{matchedCount} of {files.length} look like they’re from the event.</span>
                  <span className="flex-1" />
                  <Button size="xs" variant="ghost" onClick={() => setAll(f => (f.error ? null : { selected: true }))}>Select all</Button>
                  <Button size="xs" variant="ghost" onClick={() => setAll(() => ({ selected: false }))}>None</Button>
                  <Button size="xs" variant="ghost" icon={<Globe />} onClick={() => setAll(() => ({ visibility: 'public' }))}>All public</Button>
                  <Button size="xs" variant="ghost" icon={<Lock />} onClick={() => setAll(() => ({ visibility: 'private' }))}>All private</Button>
                </div>
              )}
              {step === 'done' && (
                <p className="mb-3 rounded-2xl bg-white/[0.05] px-4 py-3 text-sm" role="status">
                  Added {counts.done}{counts.skipped ? ` · ${counts.skipped} already there` : ''}{counts.failed ? ` · ${counts.failed} didn’t upload` : ''}.
                </p>
              )}
              <ul className="space-y-2">
                {files.map(f => {
                  const r = rows[f.key] || { selected: false, visibility: 'private' as ItemVisibility };
                  const locked = step !== 'review';
                  if (locked && !r.status) return null;
                  return (
                    <li key={f.key} className={`flex items-center gap-3 rounded-2xl border px-3 py-2 ${r.selected ? 'border-white/15 bg-white/[0.05]' : 'border-white/5 bg-transparent opacity-70'}`}>
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                        <input type="checkbox" className="h-5 w-5 shrink-0 accent-[#D40055]" checked={r.selected} disabled={locked || !!f.error} onChange={e => set(f.key, { selected: e.target.checked })} aria-label={`Include ${f.name}`} />
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-white/5">
                          {f.previewUrl ? <img src={f.previewUrl} alt="" className="h-full w-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                            : <Film size={20} className="absolute inset-0 m-auto text-white/40" aria-hidden />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">{f.name}</p>
                          <p className={`truncate text-xs ${f.error ? 'text-red-300' : f.match.match ? 'text-emerald-300/80' : 'text-white/45'}`}>
                            {f.error || `${f.match.why} · ${fmtWhen(f.takenAt, pool.timezone)} · ${mb(f.size)}`}
                          </p>
                          {r.note && <p className="truncate text-xs text-amber-200/80">{r.note}</p>}
                          {r.status === 'working' && typeof r.progress === 'number' && (
                            <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden><div className="h-full bg-[var(--pj-magenta,#D40055)] transition-[width]" style={{ width: `${Math.round(r.progress * 100)}%` }} /></div>
                          )}
                        </div>
                      </label>
                      {r.status === 'done' ? <Check size={18} className="shrink-0 text-emerald-300" aria-label="Uploaded" />
                        : r.status === 'failed' ? <AlertTriangle size={18} className="shrink-0 text-red-300" aria-label="Failed" />
                        : (
                          <button type="button" disabled={locked || !r.selected} onClick={() => set(f.key, { visibility: r.visibility === 'public' ? 'private' : 'public' })}
                            className={`tap inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${r.visibility === 'public' ? 'bg-[var(--pj-magenta,#D40055)]/20 text-pink-200' : 'bg-white/10 text-white/70'}`}
                            aria-pressed={r.visibility === 'public'} aria-label={`${f.name}: ${r.visibility === 'public' ? 'Public' : 'Private'}. Tap to change.`}>
                            {r.visibility === 'public' ? <Globe size={12} aria-hidden /> : <Lock size={12} aria-hidden />}{r.visibility === 'public' ? 'Public' : 'Private'}
                          </button>
                        )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {error && <p className="mt-3 text-sm text-red-300" role="alert">{error}</p>}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-white/10 px-5 py-3">
          {step === 'review' && <>
            <Button variant="ghost" onClick={() => { releasePrepared(files); setFiles([]); setRows({}); setStep('pick'); }}>Pick again</Button>
            <Button variant="primary" disabled={!selected.length} onClick={upload}>Add {selected.length || ''} to the pool</Button>
          </>}
          {step === 'uploading' && <Button variant="secondary" onClick={cancel}>Stop</Button>}
          {step === 'done' && <>
            <Button variant="ghost" onClick={() => { releasePrepared(files); setFiles([]); setRows({}); setStep('pick'); }}>Add more</Button>
            <Button variant="primary" onClick={onClose}>Done</Button>
          </>}
          {busy && step === 'reading' && <span className="text-xs text-white/40">Nothing is uploaded yet.</span>}
        </footer>
      </div>
    </div>
  );
}
