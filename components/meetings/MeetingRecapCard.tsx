import React, { useEffect, useState } from 'react';
import { ListChecks, Play, Users, Clock, X, Circle } from 'lucide-react';
import Portal from '../Portal';
import MeetingRecordingView from './MeetingRecordingView';
import { getRecording, listenRecordings } from '../../services/meetings/meetingRecording';
import { clock, type MeetingRecapRef, type MeetingRecording } from '../../services/meetings/meetingRecordingCore';

/** The chat bubble for a posted recap; opens the recording (replay, transcript, full recap). */
export const MeetingRecapCard: React.FC<{ roomId: string; recap: MeetingRecapRef; summary?: string }> = ({ roomId, recap, summary }) => {
  const [open, setOpen] = useState<MeetingRecording | null>(null);
  const [error, setError] = useState('');
  const openIt = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setError('');
    const rec = await getRecording(roomId, recap.recordingId).catch(() => null);
    if (rec) setOpen(rec); else setError('This recording is no longer available.');
  };
  return (
    <div className="flex flex-col gap-2 min-w-[240px] max-w-[min(340px,72vw)]">
      <p className="text-[10px] font-black uppercase tracking-widest opacity-70 flex items-center gap-1.5"><ListChecks size={12} /> Meeting recap</p>
      <p className="text-[14px] font-bold leading-tight">{recap.title}</p>
      {summary && <p className="text-[12px] opacity-85 leading-snug line-clamp-4">{summary}</p>}
      <p className="text-[10px] opacity-60 flex flex-wrap items-center gap-x-3 gap-y-1">
        {recap.durationSec > 0 && <span className="flex items-center gap-1"><Clock size={10} />{clock(recap.durationSec * 1000)}</span>}
        {!!recap.speakers.length && <span className="flex items-center gap-1"><Users size={10} />{recap.speakers.slice(0, 4).join(', ')}{recap.speakers.length > 4 ? ` +${recap.speakers.length - 4}` : ''}</span>}
        {recap.actionCount > 0 && <span>{recap.actionCount} action {recap.actionCount === 1 ? 'item' : 'items'}</span>}
      </p>
      <button type="button" onClick={openIt} className="self-start flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/25 hover:bg-black/40 text-[11px] font-bold">
        <Play size={11} /> Open recap and transcript
      </button>
      {error && <p className="text-[11px] text-red-300">{error}</p>}
      {open && <MeetingRecordingView roomId={roomId} recording={open} onClose={() => setOpen(null)} />}
    </div>
  );
};

/** Every recording made in this room, newest first. */
export const MeetingRecordingsPanel: React.FC<{ roomId: string; onClose: () => void }> = ({ roomId, onClose }) => {
  const [recs, setRecs] = useState<MeetingRecording[] | null>(null);
  const [open, setOpen] = useState<MeetingRecording | null>(null);
  useEffect(() => listenRecordings(roomId, setRecs), [roomId]);
  return (
    <Portal>
      <div className="fixed inset-0 z-[320] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label="Recordings">
        <div className="w-full max-w-md max-h-[80vh] flex flex-col rounded-2xl bg-[#121212] border border-white/10 shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
            <Circle size={12} className="text-red-500 fill-red-500" />
            <h2 className="text-xs font-black uppercase tracking-widest text-white flex-1">Recordings</h2>
            <button onClick={onClose} aria-label="Close" className="p-1 rounded-lg hover:bg-white/10"><X size={15} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {recs === null ? <p className="text-[12px] text-white/40 text-center py-8">Loading…</p>
              : !recs.length ? <p className="text-[12px] text-white/40 text-center py-8 px-6">No recordings yet. Start one from the Record button during a call.</p>
              : recs.map(r => (
                <button key={r.id} onClick={() => setOpen(r)} className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/[0.06] flex flex-col gap-0.5">
                  <span className="text-[13px] text-white truncate">{r.title}</span>
                  <span className="text-[11px] text-white/45">
                    {new Date(r.startedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    {r.status === 'RECORDING' ? ' · recording now' : r.durationSec ? ` · ${clock(r.durationSec * 1000)}` : ''}
                    {` · ${r.mode === 'CLOUD' ? 'cloud' : `on ${r.hostName}'s device`}`}{r.recap ? ' · recap ready' : ''}
                  </span>
                </button>
              ))}
          </div>
        </div>
      </div>
      {open && <MeetingRecordingView roomId={roomId} recording={open} onClose={() => setOpen(null)} />}
    </Portal>
  );
};
