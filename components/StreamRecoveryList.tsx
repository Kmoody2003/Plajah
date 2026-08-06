// StreamRecoveryList — recover live streams whose upload failed (or never finished).
//
// Every Reello live is written to on-device storage AS it records, so a failed upload or a
// closed app never loses it. This surfaces ALL those un-uploaded recordings as a list you can
// act on: retry the upload to Reello, download the file to your phone, or delete it. Without
// this, a failed upload left the recording stranded with no way back to it.

import React, { useEffect, useState, useCallback } from 'react';
import { Upload, Download, Trash2, CheckCircle2, Loader2, HardDrive, X, AlertTriangle } from 'lucide-react';
import {
  listPendingLocalRecordings, assembleLocalRecording, downloadLocalRecording,
  deleteLocalRecording, markLocalRecordingUploaded, type LocalRecordingMeta,
} from '../services/localRecordingStore';
import { uploadVideo } from '../services/backendService';

type ItemState = 'idle' | 'uploading' | 'uploaded' | 'error';

const fmtBytes = (b: number) => b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(0)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`;
const fmtWhen = (ms: number) => { try { return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const fmtDur = (chunks: number) => { const s = chunks; const m = Math.floor(s / 60); return m ? `${m}m ${s % 60}s` : `${s}s`; };

const StreamRecoveryList: React.FC<{ onClose?: () => void; embedded?: boolean; hideWhenEmpty?: boolean }> = ({ onClose, embedded, hideWhenEmpty }) => {
  const [items, setItems] = useState<LocalRecordingMeta[] | null>(null);
  const [states, setStates] = useState<Record<string, ItemState>>({});

  const refresh = useCallback(() => {
    listPendingLocalRecordings()
      .then(list => setItems(list.sort((a, b) => b.startedAt - a.startedAt)))
      .catch(() => setItems([]));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const setState = (id: string, s: ItemState) => setStates(p => ({ ...p, [id]: s }));

  const upload = async (rec: LocalRecordingMeta) => {
    setState(rec.id, 'uploading');
    try {
      const blob = await assembleLocalRecording(rec.id);
      if (!blob || blob.size < 1000) throw new Error('empty');
      const file = new File([blob], `${(rec.title || 'live').replace(/[^\w.\-]+/g, '_')}.webm`, { type: blob.type || 'video/webm' });
      await uploadVideo({
        file,
        title: `${rec.title || 'Live Stream'} (Live Replay)`,
        description: `Recovered live recording from ${fmtWhen(rec.startedAt)}`,
        isLiveRecording: true,
        genre: 'Live',
      } as any);
      await markLocalRecordingUploaded(rec.id).catch(() => {});
      await deleteLocalRecording(rec.id).catch(() => {});
      setState(rec.id, 'uploaded');
      setTimeout(refresh, 1200);
    } catch {
      setState(rec.id, 'error');
    }
  };

  const remove = async (id: string) => {
    await deleteLocalRecording(id).catch(() => {});
    refresh();
  };

  const pending = items?.filter(i => states[i.id] !== 'uploaded') ?? [];

  // Embedded-in-a-list mode: render nothing at all when there's nothing to recover.
  if (hideWhenEmpty && items !== null && pending.length === 0) return null;

  const body = (
    <>
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 grid place-items-center shrink-0"><HardDrive size={17} /></div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-white">Unsaved live recordings</p>
          <p className="text-[11px] text-white/45 leading-snug mt-0.5">
            Kept safely on this device. Retry the upload to Reello, or download to your phone's Downloads folder. They aren't deleted until you upload or remove them.
          </p>
        </div>
        {onClose && <button onClick={onClose} className="shrink-0 p-1.5 rounded-lg text-white/35 hover:text-white hover:bg-white/8"><X size={16} /></button>}
      </div>

      {items === null ? (
        <div className="py-10 flex items-center justify-center"><Loader2 size={20} className="animate-spin text-white/30" /></div>
      ) : pending.length === 0 ? (
        <div className="py-10 flex flex-col items-center justify-center gap-2 text-center">
          <CheckCircle2 size={22} className="text-green-400/70" />
          <p className="text-[12px] text-white/45">No unsaved recordings — everything's uploaded.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pending.map(rec => {
            const st = states[rec.id] || 'idle';
            return (
              <div key={rec.id} className="rounded-2xl bg-white/[0.04] border border-white/10 p-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-white truncate">{rec.title || 'Live Stream'}</p>
                    <p className="text-[10px] text-white/40 tabular-nums">{fmtWhen(rec.startedAt)} · {fmtDur(rec.chunks)} · {fmtBytes(rec.bytes)}</p>
                  </div>
                  {st === 'uploaded' && <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-green-400"><CheckCircle2 size={13} /> Saved</span>}
                </div>
                {st === 'error' && (
                  <p className="mt-2 flex items-center gap-1.5 text-[10px] text-red-300"><AlertTriangle size={11} /> Upload failed — try again, or download the file so you don't lose it.</p>
                )}
                <div className="flex items-center gap-2 mt-2.5">
                  <button
                    onClick={() => upload(rec)}
                    disabled={st === 'uploading' || st === 'uploaded'}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white text-[11px] font-black uppercase tracking-widest transition-colors"
                  >
                    {st === 'uploading' ? <><Loader2 size={13} className="animate-spin" /> Uploading…</> : <><Upload size={13} /> Upload to Reello</>}
                  </button>
                  <button onClick={() => downloadLocalRecording(rec.id).catch(() => {})} title="Download to device"
                    className="px-3 py-2 rounded-xl bg-white/8 hover:bg-white/15 text-white/70 hover:text-white transition-colors"><Download size={15} /></button>
                  <button onClick={() => remove(rec.id)} title="Delete"
                    className="px-3 py-2 rounded-xl bg-white/8 hover:bg-red-500/20 text-white/50 hover:text-red-300 transition-colors"><Trash2 size={15} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  if (embedded) return <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4">{body}</div>;

  return (
    <div className="fixed inset-0 z-[600] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={onClose}>
      <div className="w-full sm:max-w-md bg-[#0e0f13] border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 max-h-[85vh] overflow-y-auto" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }} onClick={e => e.stopPropagation()}>
        {body}
      </div>
    </div>
  );
};

export default StreamRecoveryList;
