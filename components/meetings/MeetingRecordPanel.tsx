import React, { useEffect, useState } from 'react';
import { Circle, Cloud, HardDrive, Mic, Video, X, Lock, FileDown } from 'lucide-react';
import { myRecordingAllowance } from '../../services/meetings/meetingRecording';
import { modeBlockedReason, type RecordingAllowance, type RecordingKind, type RecordingMode } from '../../services/meetings/meetingRecordingCore';
import { supportsFilePicker } from '../../services/localRecordingStore';

export interface RecordChoice { mode: RecordingMode; kind: RecordingKind; alsoToFile: boolean }

/** Pick how to record: on this device (free, default) or to the cloud (audio free, video with Plajah+). */
export const MeetingRecordPanel: React.FC<{
  defaultKind: RecordingKind;
  onStart: (choice: RecordChoice) => void;
  onClose: () => void;
  busy?: boolean;
  error?: string;
}> = ({ defaultKind, onStart, onClose, busy, error }) => {
  const [allowance, setAllowance] = useState<RecordingAllowance | null>(null);
  const [mode, setMode] = useState<RecordingMode>('LOCAL');
  const [kind, setKind] = useState<RecordingKind>(defaultKind);
  const [alsoToFile, setAlsoToFile] = useState(false);
  useEffect(() => { myRecordingAllowance().then(setAllowance).catch(() => setAllowance(null)); }, []);
  const blocked = allowance ? modeBlockedReason(mode, kind, allowance) : null;

  const option = (m: RecordingMode, icon: React.ReactNode, title: string, detail: string) => (
    <button type="button" onClick={() => setMode(m)} aria-pressed={mode === m}
      className={`flex-1 text-left p-3 rounded-2xl border transition-colors ${mode === m ? 'border-red-400/70 bg-red-500/10' : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'}`}>
      <span className="flex items-center gap-2 text-[12px] font-bold text-white">{icon}{title}</span>
      <span className="block text-[11px] text-white/50 mt-1 leading-snug">{detail}</span>
    </button>
  );

  return (
    <div role="dialog" aria-label="Record this meeting" className="w-[min(360px,92vw)] p-4 rounded-3xl bg-[#111]/95 backdrop-blur-xl border border-white/10 shadow-2xl flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Circle size={13} className="text-red-500 fill-red-500" />
        <h3 className="text-xs font-black uppercase tracking-widest text-white flex-1">Record this meeting</h3>
        <button onClick={onClose} aria-label="Close" className="p-1 rounded-lg hover:bg-white/10"><X size={14} /></button>
      </div>
      <div className="flex gap-2">
        {option('LOCAL', <HardDrive size={13} />, 'This device', 'Free. The file stays on your computer or phone and survives a crash.')}
        {option('CLOUD', <Cloud size={13} />, 'Plajah cloud', allowance?.cloudVideo
          ? `Everyone in the chat can replay it. Kept ${allowance.cloudRetentionDays} days.`
          : `Audio is free and kept ${allowance?.cloudRetentionDays ?? 30} days. Video needs Plajah+.`)}
      </div>
      <div className="flex gap-2" role="group" aria-label="What to record">
        {(['VIDEO', 'AUDIO'] as RecordingKind[]).map(k => (
          <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-bold transition-colors ${kind === k ? 'bg-white text-black' : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.12]'}`}>
            {k === 'VIDEO' ? <Video size={13} /> : <Mic size={13} />}{k === 'VIDEO' ? 'Video + audio' : 'Audio only'}
          </button>
        ))}
      </div>
      {supportsFilePicker() && (
        <label className="flex items-center gap-2 text-[11px] text-white/70" htmlFor="rec-also-file">
          <input id="rec-also-file" type="checkbox" checked={alsoToFile} onChange={e => setAlsoToFile(e.target.checked)} className="w-3.5 h-3.5" />
          <FileDown size={12} /> Also save straight to a file I choose
        </label>
      )}
      <p className="text-[10px] text-white/45 leading-snug">
        Everyone sees a recording notice. Each person's device writes captions for their own voice, and anyone can turn that off for themselves.
      </p>
      {blocked && <p className="text-[11px] text-amber-300 flex items-start gap-1.5"><Lock size={12} className="mt-0.5 shrink-0" />{blocked}</p>}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      <button type="button" disabled={!!blocked || busy || !allowance} onClick={() => onStart({ mode, kind, alsoToFile })}
        className="py-2.5 rounded-2xl bg-red-500 hover:bg-red-400 text-white text-[12px] font-black uppercase tracking-widest disabled:opacity-40">
        {busy ? 'Starting…' : 'Start recording'}
      </button>
    </div>
  );
};

/** The notice everyone in the call sees while a recording runs. */
export const RecordingNotice: React.FC<{
  hostName: string; isHost: boolean; mode: RecordingMode; startedAt: number;
  optOut: boolean; onToggleOptOut: () => void; onStop?: () => void; stopping?: boolean;
}> = ({ hostName, isHost, mode, startedAt, optOut, onToggleOptOut, onStop, stopping }) => {
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick(n => n + 1), 1000); return () => window.clearInterval(t); }, []);
  const s = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const elapsed = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return (
    <div role="status" className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-2xl bg-red-500/15 border border-red-500/30 text-[11px] text-white">
      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" aria-hidden />
      <span className="font-bold">{isHost ? 'You are recording' : `${hostName} is recording`}</span>
      <span className="text-white/50 tabular-nums">{elapsed} · {mode === 'CLOUD' ? 'to the cloud' : isHost ? 'on this device' : 'on their device'}</span>
      <button type="button" onClick={onToggleOptOut} className="ml-auto underline underline-offset-2 text-white/70 hover:text-white">
        {optOut ? 'Include my captions' : "Don't transcribe me"}
      </button>
      {isHost && onStop && (
        <button type="button" onClick={onStop} disabled={stopping} className="px-2.5 py-1 rounded-lg bg-white text-black font-bold disabled:opacity-50">
          {stopping ? 'Saving…' : 'Stop'}
        </button>
      )}
    </div>
  );
};

/** Live captions overlay: the last few lines, one interim line per speaker. */
export const LiveCaptionsOverlay: React.FC<{ lines: { uid: string; name: string; text: string; final: boolean }[]; status?: string; error?: string }> = ({ lines, status, error }) => {
  const shown = lines.slice(-3);
  return (
    <div aria-live="polite" className="pointer-events-none flex flex-col items-center gap-1 px-4">
      {shown.map((l, i) => (
        <p key={`${l.uid}-${i}-${l.text.slice(0, 12)}`} className={`max-w-[min(760px,92vw)] px-3 py-1.5 rounded-xl bg-black/75 text-[14px] leading-snug ${l.final ? 'text-white' : 'text-white/70 italic'}`}>
          <span className="font-bold text-amber-300 mr-1.5">{l.name}</span>{l.text}
        </p>
      ))}
      {!shown.length && (error || status) && <p className="px-3 py-1 rounded-xl bg-black/70 text-[11px] text-white/60">{error || status}</p>}
    </div>
  );
};
