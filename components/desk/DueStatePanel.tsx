// The student's view of an assignment's dates on the desk: when it's due, whether late work is taken, and —
// once a locked assignment is past due — the "Ask for an extension" form and where that request stands.
import React, { useEffect, useState } from 'react';
import { CalendarClock, Hourglass, Lock, Send } from 'lucide-react';
import type { UniversalDeskAssignment } from '../../services/universalStudentDeskService';
import { afterDueOf, fmtWhen, turnInState, type TurnInState } from '../../services/edu/assignmentPolicy';
import { fetchMyExtension, requestExtension, type ExtensionRequest } from '../../services/edu/extensions';

/** Loads this student's extension request for an assignment (Christian Ed only). */
export function useMyExtension(a: UniversalDeskAssignment | null): [ExtensionRequest | null, (r: ExtensionRequest | null) => void] {
  const [ext, setExt] = useState<ExtensionRequest | null>(null);
  useEffect(() => {
    setExt(null);
    if (!a || a.domain !== 'CHRISTIAN_EDUCATION') return;
    let live = true;
    void fetchMyExtension(a.id).then(r => { if (live) setExt(r); });
    return () => { live = false; };
  }, [a?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return [ext, setExt];
}

export function dueChipText(a: UniversalDeskAssignment, s: TurnInState): string {
  switch (s.kind) {
    case 'not_open': return `Opens ${fmtWhen(s.opensAt)}`;
    case 'extended': return `Extended to ${fmtWhen(s.dueAt)}`;
    case 'late_allowed': return `Past due ${fmtWhen(s.dueAt)} · late work accepted`;
    case 'locked': return `Past due ${fmtWhen(s.dueAt)} · locked`;
    default: return afterDueOf(a) === 'accept_late' ? `${a.dueLabel} · late work accepted` : a.dueLabel;
  }
}

export const DueStatePanel: React.FC<{
  assignment: UniversalDeskAssignment;
  studentName: string;
  extension: ExtensionRequest | null;
  onExtension: (r: ExtensionRequest) => void;
}> = ({ assignment, studentName, extension, onExtension }) => {
  const s = turnInState(assignment, extension);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (s.kind === 'late_allowed') {
    return (
      <div className="w-full rounded-2xl border border-amber-300/40 bg-amber-400/10 px-4 py-3 text-xs text-amber-100 flex items-center gap-2">
        <Hourglass size={14} className="shrink-0" /> This was due {fmtWhen(s.dueAt)}. Your teacher still takes it, marked late.
      </div>
    );
  }
  if (s.kind !== 'locked') return null;

  const ask = async () => {
    if (!reason.trim()) { setErr('Tell your teacher why you need more time.'); return; }
    setBusy(true); setErr('');
    try {
      onExtension(await requestExtension(assignment, reason, studentName, extension));
      setReason('');
    } catch {
      setErr('Couldn’t send it. Check you’re signed in and try again.');
    }
    setBusy(false);
  };

  return (
    <div className="w-full rounded-2xl border border-rose-300/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-50 space-y-2" role="status">
      <div className="flex items-center gap-2 font-black">
        <Lock size={14} className="shrink-0" /> This was due {fmtWhen(s.dueAt)}. It can’t be turned in now unless your teacher gives you an extension.
      </div>
      {extension?.status === 'requested' && (
        <div className="flex items-center gap-2 text-amber-100"><CalendarClock size={13} /> You asked for an extension {fmtWhen(extension.requestedAt)}. Your teacher hasn’t answered yet.</div>
      )}
      {extension?.status === 'denied' && (
        <div className="text-rose-100">Your teacher said no{extension.note ? `: “${extension.note}”` : '.'} You can ask again with more detail.</div>
      )}
      {extension?.status === 'granted' && extension.extendedUntil && (
        <div className="text-amber-100">Your extension ran out {fmtWhen(extension.extendedUntil)}. You can ask again.</div>
      )}
      {extension?.status !== 'requested' && (
        <div className="flex flex-col sm:flex-row gap-2">
          <label className="sr-only" htmlFor="ext-reason">Why you need more time</label>
          <textarea
            id="ext-reason"
            value={reason}
            onChange={e => setReason(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="Why you need more time"
            className="flex-1 rounded-xl bg-black/40 border border-white/20 px-3 py-2 text-white placeholder:text-white/40"
          />
          <button type="button" disabled={busy} onClick={ask} className="self-start px-4 py-2 rounded-full bg-white text-black font-black inline-flex items-center gap-1.5 disabled:opacity-60">
            <Send size={12} /> {busy ? 'Sending…' : 'Ask for an extension'}
          </button>
        </div>
      )}
      {err && <div className="text-rose-200">{err}</div>}
    </div>
  );
};
