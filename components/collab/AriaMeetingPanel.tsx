// components/collab/AriaMeetingPanel.tsx — Aria's seat in the call: bring her in, see what she's
// doing, open her notes page. Presentational only; CollabCall owns the call and the hook.

import React, { useEffect, useState } from 'react';
import { Cpu, Cloud, FileText, ListChecks, LogOut, Sparkles, EarOff, Ear } from 'lucide-react';
import type { UseAriaMeeting } from '../../hooks/useAriaMeeting';
import type { AriaLane, AriaPresence } from '../../services/meetings/ariaMeetingCore';
import { clockOf } from '../../services/meetings/ariaMeetingCore';

const LANE_TEXT: Record<AriaLane, string> = { local: 'on this PC', cloud: 'in the cloud', rules: 'without AI' };

export const AriaMeetingPanel: React.FC<{
  /** This device runs Aria (you brought her in), or null. */
  aria: UseAriaMeeting | null;
  /** Someone else's Aria, announced over the call. */
  remote: AriaPresence | null;
  /** You can bring Aria in (an editor with a notes page to write to). */
  canBring: boolean;
  onBring: (lane: AriaLane) => void;
  onStop: () => void;
  keepMeOut: boolean;
  onKeepMeOut: (v: boolean) => void;
  localLane: { available: boolean; model?: string };
  cloudHourUsd: number | null;
  /** Shown to everyone: captions are needed for Aria to hear you. */
  captionError?: string;
}> = ({ aria, remote, canBring, onBring, onStop, keepMeOut, onKeepMeOut, localLane, cloudHourUsd, captionError }) => {
  const [picking, setPicking] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick(n => n + 1), 5000); return () => window.clearInterval(t); }, []);

  const hosting = !!aria?.active;
  const present = hosting || !!remote?.on;

  if (!present) {
    if (!canBring) return null;
    return (
      <div className="rounded-[10px] border border-white/[0.08] bg-white/[0.03] p-2">
        {!picking ? (
          <button onClick={() => setPicking(true)} className="w-full h-8 rounded-[8px] flex items-center justify-center gap-1.5 text-[.68rem] font-bold text-white bg-[linear-gradient(90deg,#7c3aed,#d40055)] hover:brightness-110" data-testid="aria-bring">
            <Sparkles size={13} /> Bring Aria
          </button>
        ) : (
          <div className="flex flex-col gap-1.5" data-testid="aria-lanes">
            <div className="text-[.64rem] text-white/70 leading-snug">
              Aria listens to everyone's captions and keeps a live notes page in this document: summary, decisions, action items and open questions. Say "Aria, …" to ask her something.
            </div>
            {localLane.available && (
              <LaneBtn icon={<Cpu size={12} />} onClick={() => { setPicking(false); onBring('local'); }} title="On this PC" sub={`${localLane.model || 'Desktop model'} · nothing leaves your computer`} />
            )}
            <LaneBtn icon={<Cloud size={12} />} onClick={() => { setPicking(false); onBring('cloud'); }} title="In the cloud" sub={`Gemini · about ${cloudHourUsd == null ? 'a few cents' : `$${cloudHourUsd < 0.01 ? '0.01' : cloudHourUsd.toFixed(2)}`} per meeting hour · the transcript is sent to Google`} testId="aria-lane-cloud" />
            <LaneBtn icon={<ListChecks size={12} />} onClick={() => { setPicking(false); onBring('rules'); }} title="Notes without AI" sub="Free · picks out decisions, actions and questions by simple rules" testId="aria-lane-rules" />
            <button onClick={() => setPicking(false)} className="text-[.62rem] text-white/50 hover:text-white/80 self-center">Not now</button>
          </div>
        )}
      </div>
    );
  }

  const laneNow: AriaLane = hosting ? aria!.lane : remote!.lane;
  const status = hosting
    ? aria!.phase === 'writing' ? 'Updating the notes…'
      : aria!.phase === 'closing' ? 'Writing the closing recap…'
      : aria!.lastUpdate ? `Listening · notes updated ${clockOf(Date.now() - aria!.lastUpdate)} ago` : 'Listening'
    : `Taking notes for ${remote!.hostName}`;

  return (
    <div className="rounded-[10px] border border-violet-400/30 bg-[linear-gradient(135deg,rgba(124,58,237,.18),rgba(212,0,85,.10))] p-2 flex flex-col gap-1.5" data-testid="aria-tile">
      <div className="flex items-center gap-2">
        <span className={`relative w-8 h-8 rounded-full flex items-center justify-center bg-[linear-gradient(135deg,#7c3aed,#d40055)] text-white ${hosting && aria!.phase === 'writing' ? 'animate-pulse' : ''}`}>
          <Sparkles size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[.7rem] font-extrabold text-white leading-tight">Aria <span className="font-semibold text-white/55">· notes {LANE_TEXT[laneNow]}</span></div>
          <div className="text-[.62rem] text-white/70 truncate" data-testid="aria-status">{status}</div>
        </div>
      </div>
      {hosting && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[.6rem] text-white/60">
          <span>{aria!.heard} lines heard</span>
          <span>{aria!.notes.decisions.length} decisions</span>
          <span>{aria!.notes.actions.length} actions</span>
          {aria!.humanEdited && <span className="text-amber-200/80" title="Someone edited the notes page; Aria keeps their edits and adds new items under 'New from Aria'.">edited by people</span>}
        </div>
      )}
      {hosting && aria!.error && <div className="text-[.6rem] text-amber-200/90">{aria!.error}</div>}
      {captionError && <div className="text-[.6rem] text-amber-200/90">Aria can't hear you: {captionError}</div>}
      <div className="flex items-center gap-1.5">
        {hosting && (
          <button onClick={aria!.focus} className="h-7 px-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-[.62rem] font-bold flex items-center gap-1"><FileText size={11} /> Open notes</button>
        )}
        <button onClick={() => onKeepMeOut(!keepMeOut)} title={keepMeOut ? 'Aria is not hearing you. Click to let her hear you again.' : 'Stop your words from reaching Aria'} className={`h-7 px-2 rounded-full text-[.62rem] font-bold flex items-center gap-1 ${keepMeOut ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20 text-white'}`} data-testid="aria-keepout">
          {keepMeOut ? <EarOff size={11} /> : <Ear size={11} />} {keepMeOut ? 'Not hearing you' : 'Hearing you'}
        </button>
        {hosting && (
          <button onClick={onStop} disabled={aria!.phase === 'closing'} className="ml-auto h-7 px-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-[.62rem] font-bold flex items-center gap-1 disabled:opacity-50" data-testid="aria-stop"><LogOut size={11} /> Aria leaves</button>
        )}
      </div>
    </div>
  );
};

const LaneBtn: React.FC<{ icon: React.ReactNode; title: string; sub: string; onClick: () => void; testId?: string }> = ({ icon, title, sub, onClick, testId }) => (
  <button onClick={onClick} data-testid={testId} className="text-left rounded-[8px] border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.09] px-2 py-1.5">
    <div className="flex items-center gap-1.5 text-[.66rem] font-bold text-white">{icon} {title}</div>
    <div className="text-[.58rem] text-white/55 leading-snug mt-0.5">{sub}</div>
  </button>
);
