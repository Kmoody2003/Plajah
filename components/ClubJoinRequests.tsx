// ClubJoinRequests — club admins see who asked to join, with Approve / Decline (services/clubRequests).
import React, { useEffect, useState } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import type { ClubMembership } from '../types';
import { fetchClubJoinRequests, approveClubJoinRequest, declineClubJoinRequest } from '../services/clubRequests';

export const ClubJoinRequests: React.FC<{ clubId: string; onApproved?: (m: ClubMembership) => void }> = ({ clubId, onApproved }) => {
  const [list, setList] = useState<ClubMembership[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    fetchClubJoinRequests(clubId).then(r => { if (alive) setList(r); }).catch(() => { if (alive) setList([]); });
    return () => { alive = false; };
  }, [clubId]);
  if (!list || list.length === 0) return null;

  const decide = async (m: ClubMembership, approve: boolean) => {
    setBusy(m.id); setErr('');
    try {
      if (approve) { await approveClubJoinRequest(m); onApproved?.({ ...m, status: 'ACTIVE' }); }
      else await declineClubJoinRequest(m);
      setList(l => (l || []).filter(x => x.id !== m.id));
    } catch (e: any) { setErr(e?.message || 'Could not save that.'); }
    finally { setBusy(null); }
  };

  return (
    <section className="mb-8 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-4" aria-label="Join requests" data-testid="club-join-requests">
      <p className="text-[10px] font-black uppercase tracking-widest text-amber-300/90 mb-2">Asking to join · {list.length}</p>
      {err && <p className="text-[12px] text-red-300 mb-2">{err}</p>}
      <ul className="space-y-1.5">
        {list.map(m => (
          <li key={m.id} className="flex items-center gap-3 py-1.5">
            <span className="w-9 h-9 rounded-full overflow-hidden bg-white/10 shrink-0">{m.photoUrl ? <img src={m.photoUrl} alt="" className="w-full h-full object-cover" /> : null}</span>
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] font-semibold text-white truncate">{m.displayName || 'Member'}</span>
              {m.questionnaireAnswers?.length ? <span className="block text-[11px] text-white/50 truncate">{m.questionnaireAnswers.join(' · ')}</span> : null}
            </span>
            <button disabled={busy === m.id} onClick={() => decide(m, true)} className="px-3 h-8 rounded-full bg-[#7FD8B0] text-black text-[11px] font-bold disabled:opacity-40 inline-flex items-center gap-1">
              {busy === m.id ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Approve
            </button>
            <button disabled={busy === m.id} onClick={() => decide(m, false)} className="px-3 h-8 rounded-full border border-white/15 text-white/80 text-[11px] font-bold disabled:opacity-40 inline-flex items-center gap-1">
              <X size={11} /> Decline
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default ClubJoinRequests;
